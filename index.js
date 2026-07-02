const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.itvqvzm.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    
    const userCollection = client.db("bistroDB").collection("users");
    const menuCollection = client.db("bistroDB").collection("menu");
    const reviewsCollection = client.db("bistroDB").collection("reviews");
    const reservationCollection = client.db("bistroDB").collection("reservations");
    const cartCollection = client.db("bistroDB").collection("carts");
    const paymentCollection = client.db("bistroDB").collection("payments");
 
    //jwt related api
    app.post('/jwt', async(req,res) =>{
     const user = req.body;
     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: '1d' });
      res.send({ token });
    })

    //middlewares
    const verifyToken = (req, res, next) =>{
      // console.log('Inside verify token', req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
        if(err){
          return res.status(401).send({message: 'unauthorized access'})
        }
        req.decoded = decoded;
         next();
      })
    }

    //use verify admin after verifyToken
    const verifyAdmin = async(req, res, next) =>{
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }
    
    //users api
    app.get('/users/admin/:email', verifyToken, async(req, res) =>{
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }

      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user.role == 'admin';
      }
      res.send({ admin });
    })

    app.get('/users', verifyToken, verifyAdmin, async(req,res) =>{ 
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async(req,res) =>{
      const user = req.body;

      //insert email if user doesn't exists: you can do many ways like email unique/upsert/simple checking
      const query = {email: user.email}
      const existingUser = await userCollection.findOne(query);
      if(existingUser){
        return res.send({ message: 'User already exists', insertedId: null })
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async(req,res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    //update admin role
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req,res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    //menu 
    app.get('/menu', async(req,res) =>{
        const result = await menuCollection.find().toArray();
        res.send(result);
    })

    //get one menu card info
    app.get('/menu/:id', async(req,res) =>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await menuCollection.findOne(query);
        res.send(result);
    })

    app.post('/menu', verifyToken, verifyAdmin, async(req,res) =>{
        const item = req.body;
        const result = await menuCollection.insertOne(item);
        res.send(result);
    })

    app.patch('/menu/:id', verifyToken, verifyAdmin, async(req,res) =>{
        const item = req.body;
        const id = req.params.id;
        const filter = {_id: new ObjectId(id)}
        const updatedDoc = {
          $set: {
            name: item.name,
            recipe: item.recipe,
            image: item.image,
            category: item.category,
            price: item.price
          }
        }
        const result = await menuCollection.updateOne(filter, updatedDoc);
        res.send(result);
    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async(req,res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    //reviews
    app.get('/reviews', async(req,res) =>{
        const result = await reviewsCollection.find().toArray();
        res.send(result);
    })

    app.post("/reviews", async (req, res) => {
      const review = req.body;

      const result = await reviewsCollection.insertOne(review);

      res.send(result);
    });


      //carts collection
    app.get('/carts', async(req,res) =>{
      const email = req.query.email;
      const query = {email: email};
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async(req,res) =>{
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })

    app.delete('/carts/:id', async(req,res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })


    //payment intent
    app.post('/create-payment-intent', async(req, res) =>{
      const {price} = req.body;
      const amount = parseInt(price * 100);
    
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency:'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      payment.status = "Paid"; 
      payment.date = new Date();

      const paymentResult = await paymentCollection.insertOne(payment);

      //  carefully delete each item from the cart
      // console.log('payment info', payment);

      const query = {
        _id: {
          $in: payment.cartIds.map(id => new ObjectId(id))
        }
      };

      const deleteResult = await cartCollection.deleteMany(query);

      res.send({ paymentResult, deleteResult });
    })


  //reservations
    app.get("/admin/reservations", verifyToken, verifyAdmin, async (req, res) => {
      const result = await reservationCollection.find().toArray();
      res.send(result);
    });

  app.get('/reservations', verifyToken, async (req, res) => {
    const email = req.query.email;

    if (email !== req.decoded.email) {
      return res.status(403).send({ message: "forbidden access" });
    }

    const query = { email };

    const result = await reservationCollection.find(query).toArray();

    res.send(result);
  });

    app.post("/reservations", verifyToken, async (req, res) => {
      const reservation = req.body;

      reservation.status = "pending";

      const result = await reservationCollection.insertOne(reservation);

      res.send(result);
    });

    app.delete("/reservations/:id", async (req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await reservationCollection.deleteOne(query);
      res.send(result);
    })

    
    //stats or analytics
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      //not best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0);
      
      const result = await paymentCollection.aggregate([
        {
          $group:{
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({ 
        users, 
        menuItems, 
        orders,
        revenue
      });
    })


    //order status
    // using aggregate 
    app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => { 
      const result = await paymentCollection.aggregate([
        {
          $unwind: '$menuItemIds'
        },
        {
          $lookup:{
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: { $sum: 1},
            revenue: { $sum: '$menuItems.price' }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }

      ]).toArray();

      res.send(result)
    })

app.get("/user-stats", verifyToken, async (req, res) => {
  const email = req.query.email;

  // if (email !== req.decoded.email) {
  //   return res.status(403).send({ message: "forbidden access" });
  // }

  try {
    // Total orders (before payment or order collection)
    const orderCount = await paymentCollection.countDocuments({ email });

    // Payments (successful)
    const paymentCount = await paymentCollection.countDocuments({ email });

    // Reservations / bookings
    const bookingsCount = await reservationCollection.countDocuments({ email });

    const itemResult = await paymentCollection.aggregate([
      { $match: { email } },
      {
        $project: {
          count: { $size: { $ifNull: ["$menuItemIds", []] } }
        }
      },
      {
        $group: {
          _id: null,
          itemCount: { $sum: "$count" }
        }
      }
    ]).toArray();

    const itemCount = itemResult[0]?.itemCount || 0;

    // Total spent
    const revenueResult = await paymentCollection.aggregate([
      { $match: { email } },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: "$price" },
        },
      },
    ]).toArray();

    const totalSpent =
      revenueResult.length > 0 ? revenueResult[0].totalSpent : 0;

    res.send({
      orderCount,        
      paymentCount,      
      bookingsCount,
      totalSpent,
      itemCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: error.message });
  }
});

///admin/reservations
app.get('/admin/reservations', verifyToken, verifyAdmin, async (req, res) => {
    const result = await reservationCollection
        .find()
        .sort({ date: 1 })
        .toArray();

    res.send(result);
});

app.patch('/admin/reservations/:id', verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const { status, cancelReason } = req.body;

    const result = await reservationCollection.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                status,
                cancelReason: cancelReason || ""
            }
        }
    );

    res.send(result);
});

app.delete('/admin/reservations/:id', verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;

    const result = await reservationCollection.deleteOne({
        _id: new ObjectId(id)
    });

    res.send(result);
});


//profile
  app.get("/profile", verifyToken, async (req, res) => {
    const email = req.decoded.email;

    const user = await userCollection.findOne(
      { email },
      {
        projection: {
          password: 0
        }
      }
    );

    res.send(user);
  });

  app.patch("/profile", verifyToken, async (req, res) => {
  const email = req.decoded.email;

  const { name, phone, address } = req.body;

  const updatedDoc = {
    $set: {
      name,
      phone,
      address
    }
  };

  const result = await userCollection.updateOne(
    { email },
    updatedDoc
  );

  res.send(result);
});

app.delete("/profile", verifyToken, async (req, res) => {

  const email = req.decoded.email;

  const result = await userCollection.deleteOne({
    email
  });

  res.send(result);
});

// details of user
app.get(
  "/admin/users/:email/details",
  verifyToken,
  verifyAdmin,
  async (req, res) => {

    const email = req.params.email;

    try {

      // ---------------- User ----------------
      const user = await userCollection.findOne({ email });

      // ---------------- Payments ----------------
      const payments = await paymentCollection
        .find({ email })
        .sort({ date: -1 })
        .toArray();

      const paymentCount = payments.length;

      // ---------------- Orders ----------------
      const orderCount = paymentCount;

      // ---------------- Total Spent ----------------
      const totalSpent = payments.reduce(
        (sum, payment) => sum + payment.price,
        0
      );

      // ---------------- Bookings ----------------
      const bookings = await reservationCollection
        .find({ email })
        .sort({ date: -1 })
        .toArray();

      const bookingsCount = bookings.length;

      // ---------------- Purchased Items ----------------

      const itemAggregation = await paymentCollection.aggregate([

        {
          $match: { email }
        },

        {
          $unwind: "$menuItemIds"
        },

        {
          $lookup: {
            from: "menu",
            localField: "menuItemIds",
            foreignField: "_id",
            as: "item"
          }
        },

        {
          $unwind: "$item"
        },

        {
          $group: {
            _id: "$item.name",
            quantity: {
              $sum: 1
            },
            price: { $first: "$item.price" },
            totalPrice: { $sum: "$item.price" }
          }
        },

        {
          $project: {
            _id: 0,
            name: "$_id",
            quantity: 1,
            price: 1,
            totalPrice: 1
          }
        }

      ]).toArray();

      const itemCount = itemAggregation.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      // ---------------- Recent Payments ----------------

      // const recentPayments = payments.slice(0, 5).map(payment => ({
        
      //   date: payment.date,
      //   price: payment.price,
      //   totalItems: payment.menuItemIds?.length || 0
      // }));

      const recentPayments = await Promise.all(
      payments.slice(0, 5).map(async (payment) => {

        const ids = payment.menuItemIds.map(id => new ObjectId(id));

        const menuItems = await menuCollection
          .find({ _id: { $in: ids } })
          .project({ name: 1 })
          .toArray();

        return {
          date: payment.date,
          price: payment.price,
          totalItems: payment.menuItemIds.length,
          items: menuItems.map(item => item.name)
        };
      })
    );

      res.send({

        name: user?.name,
        email: user?.email,
        phone: user?.phone || "",
        address: user?.address || "",
        role: user?.role || "user",
        photo: user?.photo || "",

        orderCount,
        paymentCount,
        bookingsCount,
        itemCount,
        totalSpent,

        items: itemAggregation,

        recentPayments,

        bookings

      });

    }
    catch (error) {

      console.log(error);

      res.status(500).send({
        message: error.message
      });

    }

  }
);


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");


  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Bistro server is running')
})

app.listen(port, () => {
  console.log(`Bistro server is running on port ${port}`)
})


