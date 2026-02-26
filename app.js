"use strict";

const { body, validationResult } = require("express-validator");
const express = require("express");
const app = express();
const port = 3000;
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
const { v4: uuidv4 } = require("uuid");
const { MongoClient } = require("mongodb");
const mongoose = require("mongoose");
const { name } = require("ejs");

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

async function database() {
  await Country.deleteMany();
  await City.deleteMany();
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

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/cities", (req, res) => {
  City.find().then((cities) => {
    res.render("cities/index", { cities: cities });
  });
});

app.post(
  "/cities",
  body("city")
    .isLength({ min: 3 })
    .withMessage("City must be at least 3 characters long"),
  async (req, res) => {
    const errors = validationResult(req);

    await City.find().then((cities) => {
      if (!errors.isEmpty()) {
        return res.status(422).render("cities.ejs", {
          errors: errors.array(),
          cities: cities,
          city: req.body.city,
        });
      }
      City.create({
        name: req.body.city,
        uuid: uuidv4(),
      });
      res.redirect("/cities");
    });
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
  const country = await await Country.findOne({ uuid: req.params.uuid });
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
app.use((req, res) => {
  res.status(404).send("404 :page non trouvée");
});

app.listen(port, () => {
  console.log("l'api ecoute sur le port : ", port);
});
