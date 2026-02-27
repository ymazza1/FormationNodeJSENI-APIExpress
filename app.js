"use strict";

const { body, check, validationResult } = require("express-validator");
const express = require("express");
const app = express();
const port = 3000;
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
const { v4: uuidv4 } = require("uuid");
const { MongoClient, Admin } = require("mongodb");
const mongoose = require("mongoose");
const { name } = require("ejs");
const jwt = require("jsonwebtoken");
const { SECRET } = require("./dotenv.js");

const users = [
  {
    id: 1,
    username: "admin",
    password: "admin",
  },
];

const uri = "mongodb://localhost:27017/cities_app";
const client = new MongoClient(uri);
const db = client.db("cities_app");
mongoose
  .connect(uri)
  .then(() => {
    console.log("Connecté à Mongo");
  })
  .catch((err) => {
    console.log("erreur de connexion : ", err);
  });

const City = mongoose.model("City", {
  name: String,
  uuid: String,
  country: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Country",
  },
});

const Country = mongoose.model("Country", {
  name: String,
  uuid: String,
  cities: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
    },
  ],
});
const User = mongoose.model("User", {
  name: String,
  uuid: String,
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role",
  },
});
const Role = mongoose.model("Role", {
  name: String,
  uuid: String,
  users: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
});

async function database() {
  await Country.deleteMany();
  await City.deleteMany();
  await Role.deleteMany();
  await User.deleteMany();
  const france = new Country({
    name: "France",
    uuid: uuidv4(),
  });
  const toulouse = new City({
    name: "Toulouse",
    uuid: uuidv4(),
    country: france._id,
  });
  await toulouse.save();
  const rennes = new City({
    name: "Rennes",
    uuid: uuidv4(),
    country: france._id,
  });
  await rennes.save();
  france.cities.push(toulouse);
  france.cities.push(rennes);
  await france.save();
  const allemagne = new Country({
    name: "Allemagne",
    uuid: uuidv4(),
  });
  const berlin = new City({
    name: "Berlin",
    uuid: uuidv4(),
    country: allemagne._id,
  });
  await berlin.save();
  allemagne.cities.push(berlin);
  await allemagne.save();

  const admin = new Role({
    name: "Administrateur",
    uuid: uuidv4(),
  });
  const dev = new Role({
    name: "Developpeur",
    uuid: uuidv4(),
  });
  const user = new Role({
    name: "Utilisateur",
    uuid: uuidv4(),
  });
  const Tom = new User({
    name: "Tom",
    uuid: uuidv4(),
    role: dev._id,
  });
  Tom.save();
  const Jerry = new User({
    name: "Jerry",
    uuid: uuidv4(),
    role: dev._id,
  });
  Jerry.save();
  const Wanda = new User({
    name: "Wanda",
    uuid: uuidv4(),
    role: admin._id,
  });
  Wanda.save();
  const Ryu = new User({
    name: "Ryu",
    uuid: uuidv4(),
    role: user._id,
  });
  Ryu.save();

  admin.users.push(Wanda);
  dev.users.push(Tom);
  dev.users.push(Jerry);
  user.users.push(Ryu);
  admin.save();
  dev.save();
  user.save();

  await City.aggregate([
    {
      $lookup: {
        from: "countries",
        localField: "country",
        foreignField: "_id",
        as: "countryData",
      },
    },
    {
      $unwind: "$countryData",
    },
  ]).then((cities) => {
    console.log("cities: ", cities);
  });
}
database();

client
  .connect()
  .then(() => {
    console.log("Connexion réussie");
  })
  .catch((err) => {
    console.log("Connexion echouée: ", err);
  });

app.use((req, res, next) => {
  console.log(
    "method: ",
    req.method,
    " url: ",
    req.url,
    "user-agent: ",
    req.get("User-Agent"),
  );
  next();
});

app.use(express.json());
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/authentication_token", async (req, res, next) => {
  const user = users.find(
    (u) => u.username === req.body.username && u.password === req.body.password,
  );
  if (!user) {
    return res.status(400).json({ message: "Mauvais login et mot de passe" });
  }
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
    },
    SECRET,
    { expiresIn: "3 hours" },
  );
  return res.json({ access_token: token });
});

function extractBearerToken(headerValue) {
  if (typeof headerValue !== "string") {
    return false;
  }
  const matches = headerValue.match(/(bearer)\s+(\S+)/i);
  return matches && matches[2];
}
function checkTokenMiddleware(req, res, next) {
  const token =
    req.headers.authorization && extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: "Il faut un token" });
  }
  jwt.verify(token, SECRET, (err, decodedToken) => {
    if (err) {
      res.status(401).json({ message: "Mauvais token" });
    } else {
      next();
    }
  });
}
app.get("/cities", (req, res) => {
  City.find().then((cities) => {
    res.json(cities);
  });
});

app.post(
  "/cities",
  checkTokenMiddleware,
  check("name")
    .isLength({ min: 3 })
    .withMessage("City name must be at least 3 characters long"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(errors.array());
    }
    let city = await City.create({
      name: req.body.name,
      uuid: uuidv4(),
    });
    return res.status(201).json(city);
  },
);

app.get("/cities/:uuid", (req, res) => {
  City.findOne({ uuid: req.params.uuid })
    .populate("country")
    .then((city) => {
      if (city) {
        res.render("cities/city", { city: city });
      } else {
        res.status(404).send("Pas de ville avec cet uuid");
      }
    });
});

app.post("/cities/:uuid/delete", async (req, res) => {
  await City.findOneAndDelete(
    { uuid: req.params.uuid },
    { name: req.body.city },
  );
  res.redirect("/cities");
});

app.post("/cities/:uuid/update", async (req, res) => {
  await City.findOneAndUpdate(
    { uuid: req.params.uuid },
    { name: req.body.city },
  );

  res.redirect("/cities");
});

app.get("/countries", async (req, res) => {
  Country.find().then((countries) => {
    res.render("countries/index", { countries: countries });
  });
});

app.get("/countries/:uuid/cities", async (req, res) => {
  const country = await Country.findOne({ uuid: req.params.uuid });
  await City.aggregate([
    {
      $lookup: {
        from: "countries",
        localField: "country",
        foreignField: "_id",
        as: "country",
      },
    },
    {
      $unwind: "$country",
    },
    {
      $match: { "country.uuid": req.params.uuid },
    },
  ]).then((cities) => {
    res.render("countries/cities", { cities: cities, country: country });
  });
});

app.get("/roles", async (req, res) => {
  Role.find().then((roles) => {
    res.render("users/roles", { roles: roles });
  });
});
app.get("/users", async (req, res) => {
  const roles = await Role.find();
  await User.find().then((users) => {
    res.render("users/users", { users: users, roles: roles });
  });
});
app.post("/role/user_add", async (req, res) => {
  console.log("body ", res.body);

  const targetRole = Role.findOne({ uuid: req.body.role.uuid });
  const user = await User.create({
    name: req.body.name,
    uuid: uuidv4(),
    role: targetRole._id,
  });
  await user.save();
  targetRole.users.push(user);
  Role.findOneAndUpdate(
    { uuid: req.params.uuid },
    { $push: { users: user._id } },
  );

  res.redirect("/users");
});
app.get("/roles/:uuid/users", async (req, res) => {
  const role = await Role.findOne({ uuid: req.params.uuid });
  await User.aggregate([
    {
      $lookup: {
        from: "roles",
        localField: "role",
        foreignField: "_id",
        as: "role",
      },
    },
    {
      $unwind: "$role",
    },
    {
      $match: { "role.uuid": req.params.uuid },
    },
  ]).then((users) => {
    res.render("users/users-by-role", { users: users, role: role });
  });
});
app.get("/roles/:uuid/user-list", async (req, res) => {
  console.log("test");

  await Role.aggregate([
    {
      $match: { uuid: req.params.uuid },
    },
    {
      $lookup: {
        from: "users",
        localField: "users",
        foreignField: "_id",
        as: "users",
      },
    },
  ]).then((role) => {
    res.render("users/user-list", { role: role[0], users: role[0].users });
    console.log("role! : ", role);

    console.log("users! : ", role[0].users);
  });
});

app.use((req, res) => {
  res.status(404).send("404 :page non trouvée");
});

app.listen(port, () => {
  console.log("l'api ecoute sur le port : ", port);
});
