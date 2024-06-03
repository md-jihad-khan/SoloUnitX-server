const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: Stripe } = require("stripe");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: process.env.CLIENT,
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster1.iq3jpr7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Collections (Direct interaction without schemas)
    const database = client.db("Solo-Unit-X");
    const apartmentsCollection = database.collection("apartments");
    const agreementsCollection = database.collection("agreements");
    const userCollection = database.collection("users");
    const announcementCollection = database.collection("announcements");
    const couponCollection = database.collection("coupons");
    const paymentCollection = database.collection("payments");

    // jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "6h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.user = decoded;
        next();
      });
    };

    // create-payment-intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;
      if (!price || priceInCent < 1) return;
      // generate clientSecret
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      });
      // send client secret as response
      console.log(client_secret);
      res.send({ clientSecret: client_secret });
    });

    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user doesnt exists:
      // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/coupons", async (req, res) => {
      const result = await couponCollection.find().toArray();
      res.send(result);
    });

    app.get("/announcements", verifyToken, async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    // Route to get apartments with pagination
    app.get("/api/apartments", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = 6;
      const skip = (page - 1) * limit;

      const apartments = await apartmentsCollection
        .find()
        .skip(skip)
        .limit(limit)
        .toArray();
      const total = await apartmentsCollection.countDocuments();

      res.json({
        apartments,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      });
    });

    // get single agreement data
    app.get("/agreement", verifyToken, async (req, res) => {
      const email = req.user.email;
      const result = await agreementsCollection.findOne({ userEmail: email });
      res.send(result);
    });

    // Route to create an agreement
    app.post("/agreements", verifyToken, async (req, res) => {
      const { email: userEmail } = req.user;
      const agreement = req.body;
      // Check if the user has already applied for an apartment
      const existingAgreement = await agreementsCollection.findOne({
        userEmail,
      });
      if (existingAgreement) {
        return res
          .status(400)
          .send("User has already applied for an apartment");
      }

      await agreementsCollection.insertOne(agreement);
      res.json({ message: "Agreement created successfully" });
    });

    app.post("/payment", verifyToken, async (req, res) => {
      const paymentInfo = req.body;
      const result = await paymentCollection.insertOne(paymentInfo);
      res.send(result);
    });

    app.get("/payment", verifyToken, async (req, res) => {
      const email = req.user;
      const result = await paymentCollection.find(email).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hello");
});

app.listen(port, () => {
  console.log(`server running ${port}`);
});
