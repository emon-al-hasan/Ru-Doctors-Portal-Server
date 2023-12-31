const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const nodemailer=require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');



const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6fke6kl.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

function verifyJWT(req, res, next) {

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];


  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbiden access' })
    }

    req.decoded = decoded;
    next();


  })
}

const  emailSenderOptions={
  auth:{
    
    api_key:process.env.EMAIL_SENDER_KEY
  }
}


var emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(booking){

const {patient,patientName,treatment,date,slot}=booking; 

var email = {
  from:	's1811077141@ru.ac.bd',
  to:patient,
  subject:`Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
  text:`Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
  html:`
  <div>
  <p>Hello ${patientName}</p>
  <h3>Your Appointment for ${treatment} is confirmed</h3>
  <p>Looking forward to seeing you on  ${date} at ${slot}</p>
  <h3>Our Address</h3>
  <p>Mathihar,Rajshahi,Bangladesh</p>
  <p>Thanks a lot for Booking us </P>

  </div>
  `
};
emailClient.sendMail(email, function(err, res) {
  if (err) { 
      console.log(err) 
  }
  console.log(res);
});


}






async function run() {
  try {
    await client.connect();
    const servicesCollection = client.db('ru_doctors').collection('services');
    const bookingCollection = client.db('ru_doctors').collection('bookings');
    const userCollection = client.db('ru_doctors').collection('users');
    const doctorCollection = client.db('ru_doctors').collection('doctors');


  const verifyAdmin=async(req,res,next)=>{
    const requester=req.decoded.email;
    const requesterAccount=await userCollection.findOne({email:requester})
   
    if(requesterAccount.role === 'admin')
    {
      next()
    }
    else{
      res.status(403).send({message:'forbiden'})
    }
  }



    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({name:1})
      const services = await cursor.toArray();
      res.send(services);
    })
   
  app.get('/user',verifyJWT,async(req,res)=>{
    const users=await userCollection.find().toArray();
    
    res.send(users)
    
  })

  app.get('/admin/:email',async(req,res)=>{
    const email=req.params.email;
    const user=await userCollection.findOne({email:email});
    const isAdmin=user.role ==='admin';
    res.send({admin:isAdmin})
  })

  app.put('/user/admin/:email',verifyJWT,verifyAdmin, async (req, res) => {
    const email = req.params.email;
    
    
      const filter = { email: email };

      const updateDoc = {
        $set: {role :'admin'},
      };
      const result = await userCollection.updateOne(filter, updateDoc)
      
      res.send( result)
   
  })




    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options)
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
      res.send({ result, token })
    })


    app.get('/available', async (req, res) => {
      const date = req.query.date;

      const services = await servicesCollection.find().toArray();

      const query = { date: date }
      const bookings = await bookingCollection.find(query).toArray();


      services.forEach(service => {
        const serviceBookings = bookings.filter(book => book.treatment === service.name)
        const bookedSlots = serviceBookings.map(book => book.slot)

        const available = service.slots.filter(slot => !bookedSlots.includes(slot))
        service.slots = available
      });

      res.send(services)
    })


    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
    
      if (patient === decodedEmail) {
        const query = { patient: patient }
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings)

      }
      else {
        return res.status(403).send({ message: 'Forbiden access' });
      }

    })



    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      const exists = await bookingCollection.findOne(query)
      if (exists) {
        return res.send({ success: false, booking: exists })
      }

      const result = await bookingCollection.insertOne(booking)
      console.log('sending email')
      sendAppointmentEmail(booking)
      return res.send({ success: true, result });
    });

app.get('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
  const doctors=await doctorCollection.find().toArray();
  res.send(doctors)
})



app.post('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
  const doctor=req.body;
  const result=await doctorCollection.insertOne(doctor);
  res.send(result);
})


app.delete('/doctor/:email',verifyJWT,verifyAdmin,async(req,res)=>{
  const email=req.params.email;
  const filter={email:email}
  const result=await doctorCollection.deleteOne(filter);
  res.send(result);
})

  }
  finally {

  }

} run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('hello world');
})

app.listen(port, () => {
  console.log(`Doctors app is listening on port ${port}`)
})