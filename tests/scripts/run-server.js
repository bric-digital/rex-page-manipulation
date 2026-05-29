// Testing web server to validate that headers are being set correctly.

import express from 'express'

const app = express();
const port = 3000;

app.use(express.static('./tests/scripts/express/static'))

app.listen(port, () => {
  console.log(process.cwd())
  console.log(`Server running on port ${port}...`);
});
