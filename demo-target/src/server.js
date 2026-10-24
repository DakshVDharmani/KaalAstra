const express = require('express');
const bodyParser = require('body-parser');
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');

const app = express();
app.use(bodyParser.json());

app.use('/api', apiRoutes);
app.use('/webhooks', webhookRoutes);

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Payment gateway running on port ${PORT}`);
  });
}

module.exports = app;
