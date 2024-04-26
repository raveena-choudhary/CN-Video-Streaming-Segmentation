const express = require("express");
const app = express();
const port = 3000;
const router = express.Router();
const util = require("util");
const multer = require("multer");
const cors = require("cors");
const { addSegment, getData } = require("./utils");

let storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("__dirname", __dirname);
    cb(null, __dirname + "/uploads/");
  },
  filename: (req, file, cb) => {
    console.log("file", file);
    console.log(file.originalname);
    cb(null, file.originalname);
  },
});

// var corsOptions = {
//   origin: "http://localhost:1234",
// };
// app.use(cors(corsOptions));
app.use(cors());
app.options("*", cors());

let uploadFile = multer({
  storage: storage,
  //   limits: { fileSize: maxSize },
}).single("file");

let uploadFileMiddleware = util.promisify(uploadFile);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

app.get("/files", (req, res) => {
  res.send(getData());
});

const upload = async (req, res) => {
  console.log("reqqq", req.body);
  try {
    const details = await uploadFileMiddleware(req, res);
    console.log("reqqqqq", req.file, req.body.seqNo);
    addSegment(req.file, req.body.seqNo);
    // if (req.file == undefined) {
    //   return res.status(400).send({ message: "Please upload a file!" });
    // }

    res.status(200).send({
      message: "Uploaded the file successfully: " + req.file.originalname,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send({
      message: `Could not upload the file: ${req.file.originalname}. ${err}`,
    });
  }
};

router.post("/upload", upload);

//   router.get("/files/:name", controller.download);

app.use(router);
