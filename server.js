require('dotenv').config({ path: './.env' });

const express = require('express');
var cors = require('cors');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {resolve} = require('path');
const bodyParser = require('body-parser');
const port = process.env.PORT || 4242;

const path = require('path');
app.use(cors());

// This will make our form data much more useful
app.use(bodyParser.urlencoded({ extended: true }));


app.use(express.static(process.env.STATIC_DIR));
app.use(bodyParser.json());


app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    },
  })
);

app.get("/claudia", (req, res) => {
  console.log('Primer paso del get en la api');
  const filePath = path.resolve(process.env.STATIC_DIR + "/index.html");
  // console.log('Aqui tenemos el path al file.. ' + filepath);
  // console.log(filepath);
  console.log('Apunto de enviar el url');
  res.send("https://stripe.com/es-mx");
});

// Fetch the Checkout Session to display the JSON result on the success page
app.get("/checkout-session", async (req, res) => {
  const { sessionId } = req.query;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  res.send(session);
});

app.post("/create-checkout-session", async (req, res) => {
  console.log('Starting post request, answer');
  const domainURL = process.env.DOMAIN;
  console.log('domainURL: ' + domainURL);
  const { priceId } = req.body;
  console.log('domainURL: ' + priceId);

  // Create new Checkout Session for the order
  // Other optional params include:
  // [billing_address_collection] - to display billing address details on the page
  // [customer] - if you have an existing Stripe Customer ID
  // [customer_email] - lets you prefill the email input in the form
  // For full details see https://stripe.com/docs/api/checkout/sessions/create
  try {
    
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
        success_url: `${domainURL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domainURL}/canceled.html`,
    });
    res.send({
      sessionId: session.id,
    });
  } catch (e) {
    res.status(400);
    return res.send({
      error: {
        message: e.message,
      }
    });
  }
});

// success_url: `${domainURL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `${domainURL}/canceled.html`,

app.get("/setup", (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    basicPrice: process.env.BASIC_PRICE_ID,
    proPrice: process.env.PRO_PRICE_ID,
  });
});

app.post('/customer-portal', async (req, res) => {
  // For demonstration purposes, we're using the Checkout session to retrieve the customer ID. 
  // Typically this is stored alongside the authenticated user in your database.
  const { sessionId } = req.body;
  const checkoutsession = await stripe.checkout.sessions.retrieve(sessionId);

  // This is the url to which the customer will be redirected when they are done
  // managing their billing with the portal.
  const returnUrl = process.env.DOMAIN;

  const portalsession = await stripe.billingPortal.sessions.create({
    customer: checkoutsession.customer,
    return_url: returnUrl,
  });

  res.send({
    url: portalsession.url,
  });
});

// Webhook handler for asynchronous events.
app.post("/webhook", async (req, res) => {
  let data;
  let eventType;
  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers["stripe-signature"];

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    // Extract the object from the event.
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "checkout.session.completed") {
    console.log(`🔔  Payment received!`);
  }

  res.sendStatus(200);
});

//app.listen(4242, () => console.log('Running on http://4242'));
//  app.listen(4242, () => console.log(`Node servercito listening at http://localhost:${4242}/`));

app.listen(port, () => {
  console.log(`Server running at port `+ port);
});
