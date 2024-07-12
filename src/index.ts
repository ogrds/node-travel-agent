import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import * as hub from "langchain/hub";

import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";

import {
  PromptTemplate,
  type ChatPromptTemplate,
} from "@langchain/core/prompts";

import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RunnableSequence } from "@langchain/core/runnables";

import { MemoryVectorStore } from "langchain/vectorstores/memory";

const llm = new ChatOpenAI({
  model: "gpt-3.5-turbo",
});

const query =
  "Vou viajar para Viena em Novembro de 2024. Quero que faça um roteiro de viagem para mim com os eventos que irão ocorrer na cidade na data da viagem, citando os melhores dias para ir em cada local, com o valor do transporte público para os eventos e com o preço das passagens aéreas de Brasília para Viena.";

async function researchAgent(query: string, llm: ChatOpenAI) {
  const tools = [new DuckDuckGoSearch(), new WikipediaQueryRun()];
  const prompt = await hub.pull<ChatPromptTemplate>("hwchase17/react");

  const agent = await createReactAgent({
    llm,
    tools,
    prompt,
  });

  const agentExecutor = new AgentExecutor({
    agent,
    tools,
  });

  const webContext = await agentExecutor.invoke({
    input: query,
  });

  return webContext.output;
}

async function loadData() {
  const loader = new CheerioWebBaseLoader(
    "https://www.dicasdeviagem.com/austria/"
  );

  const docs = await loader.load();

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const splits = await textSplitter.splitDocuments(docs);

  const vectorStore = await MemoryVectorStore.fromDocuments(
    splits,
    new OpenAIEmbeddings()
  );

  const retriever = vectorStore.asRetriever();

  return retriever;
}

async function getRelevantDocs(query: string) {
  const retriever = await loadData();
  const relevantDocuments = await retriever.invoke(query);
  return relevantDocuments;
}

async function supervisorAgent(
  query: string,
  llm: ChatOpenAI,
  webContext: string,
  relevantDocuments: any
) {
  const promptTemplate = PromptTemplate.fromTemplate(
    `Você é um gerente de uma agência de viagens. Sua resposta final deverá ser um roteiro de viagem completo e detalhado.
    Utilize o contexto de eventos e preços de passagens, o input do usuário e também os documentos relevantes para elaborar o roteiro.
    Contexto: {webContext}
    Documento relevante: {relevantDocuments}
    Usuário: {query}
    Assistente: `
  );

  const sequence = RunnableSequence.from([promptTemplate, llm]);
  const response = await sequence.invoke({
    webContext,
    relevantDocuments,
    query,
  });

  return response;
}

async function getResponse(query: string, llm: ChatOpenAI) {
  const webContext = await researchAgent(query, llm);
  const relevantDocuments = await getRelevantDocs(query);
  const response = await supervisorAgent(
    query,
    llm,
    webContext,
    relevantDocuments
  );

  return response;
}

const lambdaHandler = async (event: any, context: any) => {
  const query = event.get("question");
  const response = await getResponse(query, llm);

  return {
    body: response,
    status: 200,
  };
};
