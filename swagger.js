const swaggerAutogen = require("swagger-autogen");

const outputFile = "./swagger_output.json";
swaggerAutogen(outputFile, ["./app.js"]);
