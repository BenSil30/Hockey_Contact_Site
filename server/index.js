import startApp from "./app.js";


const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

startApp(port)