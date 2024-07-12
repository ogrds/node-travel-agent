# Use AWS base image for Node 20
FROM public.ecr.aws/lambda/nodejs:20

# Install build-essential compiler and tools
RUN microdnf update -y && microdnf install -y gcc-c++ make

# Copy the package.json and package-lock.json  
COPY package*.json ${LAMBDA_TASK_ROOT}

# Copy the source code
COPY dist/index.js ${LAMBDA_TASK_ROOT}

# Install the dependencies
RUN npm install

# Remove dev dependencies
RUN npm prune --production

# Set the command to run the application
CMD ["index.lambdaHandler"]
