// import fs from "fs";
// const note2 = "Note 2";
const fs = require("fs");
// const getNotes = () => note + "\n" + note2;
const addSegment = (file, segNo) => {
  let oldData = fs.readFileSync("data.json", "utf8");
  console.log(oldData);
  //   if (!oldData) {
  //     oldData = "{}";
  //   }
  const jsonData = JSON.parse(oldData || "{}");
  jsonData[segNo] = {
    ...(file || {}),
    segNo,
  };
  fs.writeFileSync("data.json", JSON.stringify(jsonData));
};

const readData = () => {
  return fs.readFileSync("data.json", "utf8");
};

const exportsFn = {
  getData: readData,
  addSegment,
};
module.exports = exportsFn;
