"use strict";
import mp4Box from "mp4box";
import ffmpegStatic from "ffmpeg-static";
// import { path } from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
// ffmpeg.setFfmpegPath(path);
import { Canvas, loadImage, registerFont } from "canvas";
import * as fs from "fs";
const { spawn } = require("child_process");
const { Readable } = require("stream");
import { fs } from "browser-fs-access";
import WebMMuxer from "webm-muxer";
import WebMWriter from "webm-writer";
import Writer from "./writer.js";
// WebMWriter = require('webm-writer'),
// new w()
// const command = (frameStream) =>
//   ffmpeg()
//     .input(frameStream)
//     .inputFormat("h264")
//     .outputFormat("image2pipe")
//     .outputOptions("-vframes 1")
//     .outputOptions("-q:v 1")
//     .outputOptions("-f image2")
//     .output("-")
//     .on("error", (err) => {
//       console.error(err);
//     });
// function toArrayBuffer(buffer) {
//   var ab = new ArrayBuffer(buffer.length);
//   var view = new Uint8Array(ab);
//   for (var i = 0; i < buffer.length; ++i) {
//     view[i] = buffer[i];
//   }
//   return ab;
// }

let encoder,
  decoder,
  pl,
  started = false,
  stopped = false;

let encqueue_aggregate = {
  all: [],
  min: Number.MAX_VALUE,
  max: 0,
  avg: 0,
  sum: 0,
};

let decqueue_aggregate = {
  all: [],
  min: Number.MAX_VALUE,
  max: 0,
  avg: 0,
  sum: 0,
};

function encqueue_update(duration) {
  encqueue_aggregate.all.push(duration);
  encqueue_aggregate.min = Math.min(encqueue_aggregate.min, duration);
  encqueue_aggregate.max = Math.max(encqueue_aggregate.max, duration);
  encqueue_aggregate.sum += duration;
}

function encqueue_report() {
  encqueue_aggregate.all.sort();
  const len = encqueue_aggregate.all.length;
  const half = len >> 1;
  const f = (len + 1) >> 2;
  const t = (3 * (len + 1)) >> 2;
  const alpha1 = (len + 1) / 4 - Math.trunc((len + 1) / 4);
  const alpha3 = (3 * (len + 1)) / 4 - Math.trunc((3 * (len + 1)) / 4);
  const fquart =
    encqueue_aggregate.all[f] +
    alpha1 * (encqueue_aggregate.all[f + 1] - encqueue_aggregate.all[f]);
  const tquart =
    encqueue_aggregate.all[t] +
    alpha3 * (encqueue_aggregate.all[t + 1] - encqueue_aggregate.all[t]);
  const median =
    len % 2 === 1
      ? encqueue_aggregate.all[len >> 1]
      : (encqueue_aggregate.all[half - 1] + encqueue_aggregate.all[half]) / 2;
  return {
    count: len,
    min: encqueue_aggregate.min,
    fquart: fquart,
    avg: encqueue_aggregate.sum / len,
    median: median,
    tquart: tquart,
    max: encqueue_aggregate.max,
  };
}

function decqueue_update(duration) {
  decqueue_aggregate.all.push(duration);
  decqueue_aggregate.min = Math.min(decqueue_aggregate.min, duration);
  decqueue_aggregate.max = Math.max(decqueue_aggregate.max, duration);
  decqueue_aggregate.sum += duration;
}

function decqueue_report() {
  decqueue_aggregate.all.sort();
  const len = decqueue_aggregate.all.length;
  const half = len >> 1;
  const f = (len + 1) >> 2;
  const t = (3 * (len + 1)) >> 2;
  const alpha1 = (len + 1) / 4 - Math.trunc((len + 1) / 4);
  const alpha3 = (3 * (len + 1)) / 4 - Math.trunc((3 * (len + 1)) / 4);
  const fquart =
    decqueue_aggregate.all[f] +
    alpha1 * (decqueue_aggregate.all[f + 1] - decqueue_aggregate.all[f]);
  const tquart =
    decqueue_aggregate.all[t] +
    alpha3 * (decqueue_aggregate.all[t + 1] - decqueue_aggregate.all[t]);
  const median =
    len % 2 === 1
      ? decqueue_aggregate.all[len >> 1]
      : (decqueue_aggregate.all[half - 1] + decqueue_aggregate.all[half]) / 2;
  return {
    count: len,
    min: decqueue_aggregate.min,
    fquart: fquart,
    avg: decqueue_aggregate.sum / len,
    median: median,
    tquart: tquart,
    max: decqueue_aggregate.max,
  };
}

// export async function stitchFramesToVideo(
//   framesFilepath,
//   // soundtrackFilePath,
//   outputFilepath,
//   duration,
//   frameRate
// ) {
//   await new Promise((resolve, reject) => {
//     ffmpeg()
//       // Tell FFmpeg to stitch all images together in the provided directory
//       .input(framesFilepath)
//       .inputOptions([
//         // Set input frame rate
//         `-framerate ${frameRate}`,
//       ])

//       // Add the soundtrack
//       // .input(soundtrackFilePath)
//       // .audioFilters([
//       //   // Fade out the volume 2 seconds before the end
//       //   `afade=out:st=${duration - 2}:d=2`,
//       // ])

//       .videoCodec("libx264")
//       .outputOptions([
//         // YUV color space with 4:2:0 chroma subsampling for maximum compatibility with
//         // video players
//         "-pix_fmt yuv420p",
//       ])

//       // Set the output duration. It is required because FFmpeg would otherwise
//       // automatically set the duration to the longest input, and the soundtrack might
//       // be longer than the desired video length
//       .duration(duration)
//       // Set output frame rate
//       .fps(frameRate)

//       // Resolve or reject (throw an error) the Promise once FFmpeg completes
//       .saveToFile(outputFilepath)
//       .on("end", () => resolve())
//       .on("error", (error) => reject(new Error(error)));
//   });
// }

const mux = async (encodedFramesArray, meta) => {
  console.log("called buf", encodedFramesArray);
  const writer = new Writer({
    codec: "h254",
    width: 1280,
    height: 720,
  });
  // const videoWriter = new WebMWriter({
  //   quality: 1, // WebM image quality from 0.0 (worst) to 1.0 (best)
  //   fd: null, // Node.js file descriptor to write to instead of buffering to memory (optional)

  //   // You must supply one of:
  //   // frameDuration: null, // Duration of frames in milliseconds
  //   frameRate: 30, // Number of frames per second
  // });

  // let fileHandle = await self.showSaveFilePicker({
  //   suggestedName: `video.webm`,
  //   types: [
  //     {
  //       description: "Video File",
  //       accept: { "video/webm": [".webm"] },
  //     },
  //   ],
  // });

  // let fileWritableStream = await fileHandle.createWritable();
  // mp4Box.createFile().addTrack()
  // let muxer = new WebMMuxer({
  //   target: (data, offset, done) => {
  //     // Do something with the data
  //     console.log("called", data, offset, done);
  //   },
  //   video: {
  //     codec: "V_VP9",
  //     width: 1280,
  //     height: 720,
  //     frameRate: 30,
  //   },
  //   type: "webm",
  //   firstTimestampBehavior: "offset",
  // });

  encodedFramesArray.forEach(async (frame, index) => {
    writer.addFrame(frame);
  });
  // const mimeType = "video/mp4; codecs='avc1.42002A'";
  // console.log(encodedFramesArray[0], meta);
  // let buffer = new Uint8Array(encodedFramesArray[0].byteLength);
  let buffer = await writer.complete();
  console.log(buffer);
  // console.log(

  // );
  // return;
  // let buffer = concatChunks(encodedFramesArray);
  // return;
  // const buffer = new Uint8Array(
  //   encodedFramesArray.reduce((acc, frame) => {
  //     const chunkData = new Uint8Array(frame.byteLength);
  //     return acc.concat(chunkData);
  //   }, [])
  // );

  // videoWriter.complete().then(function (webMBlob) {
  //   console.log("webMBlob", webMBlob);
  // const fd = new FormData();
  // fd.set("file", webMBlob, "seg-" + Date.now() + ".webm");
  // fetch("http://localhost:3000/upload", {
  //   method: "post",
  //   body: fd,
  // });
  // });

  // let buffer = muxer.finalize();
  // return
  const blob = buffer;
  // const blob = new Blob([buffer], { type: mimeType });
  const fd = new FormData();
  fd.set("file", blob, "seg-" + Date.now() + ".mp4");
  fetch("http://localhost:3000/upload", {
    method: "post",
    body: fd,
  });
  // console.log(buffer);
  // self.postMessage(buffer, [buffer]);
  // self.postMessage({ encodedFramesArray, meta }, [encodedFramesArray, meta]);
  // await fileWritableStream.close();
};

const addFramesToBuffer = async (encodedFramesArray) => {
  const mediaSource = new MediaSource();
  const sourceBuffer = mediaSource.addSourceBuffer(
    'video/mp4; codecs="avc1.42E01E"'
  );
  const buffer = new Uint8Array(
    encodedFramesArray.reduce((acc, frame) => {
      const chunkData = new Uint8Array(frame.byteLength);
      return acc.concat(chunkData);
    }, [])
  );

  // Append the buffer to the SourceBuffer
  sourceBuffer.appendBuffer(buffer);

  mediaSource.endOfStream();

  const buffer2 = await sourceBuffer.buffered[0].data();

  // Convert the buffer to a blob
  const blob = new Blob([buffer], { type: "video/mp4" });

  const url = URL.createObjectURL(blob);

  // Create a new anchor tag with the download attribute
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-video.mp4";
  link.style.display = "none";

  // Add the anchor tag to the document
  document.body.appendChild(link);

  // Click the anchor tag to download the file
  link.click();

  // Remove the anchor tag from the document
  document.body.removeChild(link);

  // Revoke the temporary URL to free memory
  URL.revokeObjectURL(url);

  // fetch('/upload-video', {
  //   method: 'POST',
  //   body: blob
  // });
};

const addFramesToVideo2 = async (encodedFramesArray) => {
  // encodedFramesArray.forEach(async (frame, index) => {
  // Assume that 'videoChunks' is an array of 90 EncodedVideoChunk objects
  const outputStream = fs.createWriteStream("output.mp4");

  // Create a Readable stream that emits the bytes of each video chunk in order
  const videoStream = new Readable({
    read(size) {
      if (!encodedFramesArray.length) {
        this.push(null);
      } else {
        const chunk = encodedFramesArray.shift();
        this.push(chunk.byteLength);
      }
    },
  });

  // Create an FFmpeg command and set the input and output options
  const command = ffmpeg();
  // command.o
  command.input(videoStream, {
    format: "mp4",
    framerate: "30",
  });
  command.outputOptions("-c copy");
  // command.noVideo();
  command.output(outputStream);

  // Create a Promise that resolves when the command finishes
  const promise = new Promise((resolve, reject) => {
    command.on("error", reject);
    command.on("end", resolve);
  });

  // Start the command and wait for it to finish
  command.run();
  await promise;

  // Get the output segment as a Buffer
  const outputBuffer = await new Promise((resolve, reject) => {
    const chunks = [];
    command.output.on("data", (chunk) => chunks.push(chunk));
    command.output.on("end", () => resolve(new Blob(chunks)));
    command.output.on("error", reject);
  });
  console.log(outputBuffer);
  // });
};

// const addFramesToVideo = async (encodedFramesArray) => {
//   encodedFramesArray.forEach(async (frame, index) => {
//     const chunkData = new Uint8Array(frame.byteLength);
//     const frameStream = new Readable();
//     frameStream.push(chunkData);
//     frameStream.push(null);

//     const process = spawn(command(frameStream));
//     let imageData = Buffer.alloc(0);
//     process.stdout.on("data", (chunk) => {
//       imageData = Buffer.concat([imageData, chunk]);
//     });
//     process.on("close", async () => {
//       // Save the image data as a PNG file
//       const paddedNumber = String(index).padStart(4, "0");
//       await fs.promises.writeFile(
//         `tmp/output/frame-${paddedNumber}.png`,
//         imageData
//       );
//     });

//     // imap.
//     // const chunkData = new Uint8Array(frame.byteLength);
//     // frame.copyTo(chunkData);
//     // const output = chunkData.toBuffer('image/png');

//     // await fs.promises.writeFile(, imap);
//   });

//   await stitchFramesToVideo(
//     "tmp/output/frame-%04d.png",
//     // 'assets/catch-up-loop-119712.mp3',
//     "out/video.mp4",
//     3,
//     30
//   );
// };

function concatChunks(chunks) {
  const concatenatedChunks = new Uint8Array(
    chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    concatenatedChunks.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return concatenatedChunks;
}

// rn result;
// }
self.addEventListener(
  "message",
  async function (e) {
    if (stopped) return;
    // In this demo, we expect at most two messages, one of each type.
    let type = e.data.type;

    if (type == "stop") {
      self.postMessage({ text: "Stop message received." });
      if (started) pl.stop();
      return;
    } else if (type != "stream") {
      self.postMessage({
        severity: "fatal",
        text: "Invalid message received.",
      });
      return;
    }
    // We received a "stream" event
    self.postMessage({ text: "Stream event received." });

    try {
      console.log("first");
      pl = new pipeline(e.data);
      pl.start();
    } catch (e) {
      self.postMessage({
        severity: "fatal",
        text: `Pipeline creation failed: ${e.message}`,
      });
      return;
    }
  },
  false
);

class pipeline {
  constructor(eventData) {
    //this.mp4Box = mp4Box.createFile();
    // console.log("first", this.mp4Box);

    this.track = null;
    this.startTime = new Date();
    // this.mp4boxfile = this.mp4Box.createFile();
    this.stopped = false;
    this.inputStream = eventData.streams.input;
    // console.log(this.inputStream);
    this.outputStream = eventData.streams.output;
    this.config = eventData.config;
    // this.mp4Box.hi = () => {
    //   console.log("hi");
    // };

    // const fragmentationSettings = {
    //   fragmentDuration: 10000, // length of each chunk in milliseconds
    // };
    // // Handle completion
    // this.mp4Box.onComplete = function () {
    //   console.log("Video fragmentation complete.");
    // };

    // const outputFilePath = ".video_%d.mp4";

    // // Set fragmentation settings
    // this.mp4Box.setSegmentOptions({
    //   fragment_duration: fragmentationSettings.fragmentDuration,
    //   fragmented: true,
    //   segment_name_template: outputFilePath,
    // });

    // this.mp4Box.onReady = function (info) {
    //   console.log("Received File Information", info);
    // };
    // this.mp4Box.onError = function (info) {
    //   console.log("Received File err", info);
    // };
    // this.mp4Box.onMoovStart = function () {
    //   console.log("Starting to receive File Information");
    // };

    // this.mp4box.onSegment = function (id, user, buffer, sampleNum) {
    //   console.log(
    //     `Created segment with id ${id} and length ${buffer.byteLength}`
    //   );
    // };
    // this.mp4Box.onSamples = function (data) {
    //   console.log(data);
    // };
  }

  DecodeVideoStream(self) {
    return new TransformStream({
      start(controller) {
        this.decoder = decoder = new VideoDecoder({
          output: (frame) => {
            controller.enqueue(frame);
            console.log("ed", frame);
          },
          error: (e) => {
            self.postMessage({
              severity: "fatal",
              text: `Init Decoder error: ${e.message}`,
            });
          },
        });
      },
      transform(chunk, controller) {
        if (this.decoder.state != "closed") {
          if (chunk.type == "config") {
            let config = JSON.parse(chunk.config);
            VideoDecoder.isConfigSupported(config)
              .then((decoderSupport) => {
                if (decoderSupport.supported) {
                  this.decoder.configure(decoderSupport.config);
                  self.postMessage({
                    text:
                      "Decoder successfully configured:\n" +
                      JSON.stringify(decoderSupport.config),
                  });
                } else {
                  self.postMessage({
                    severity: "fatal",
                    text:
                      "Config not supported:\n" +
                      JSON.stringify(decoderSupport.config),
                  });
                }
              })
              .catch((e) => {
                self.postMessage({
                  severity: "fatal",
                  text: `Configuration error: ${e.message}`,
                });
              });
          } else {
            try {
              const queue = this.decoder.decodeQueueSize;
              decqueue_update(queue);
              this.decoder.decode(chunk);
            } catch (e) {
              self.postMessage({
                severity: "fatal",
                text:
                  "Derror size: " +
                  chunk.byteLength +
                  " seq: " +
                  chunk.seqNo +
                  " kf: " +
                  chunk.keyframeIndex +
                  " delta: " +
                  chunk.deltaframeIndex +
                  " dur: " +
                  chunk.duration +
                  " ts: " +
                  chunk.timestamp +
                  " ssrc: " +
                  chunk.ssrc +
                  " pt: " +
                  chunk.pt +
                  " tid: " +
                  chunk.temporalLayerId +
                  " type: " +
                  chunk.type,
              });
              self.postMessage({
                severity: "fatal",
                text: `Catch Decode error: ${e.message}`,
              });
            }
          }
        }
      },
    });
  }

  Mp4Segment(self) {
    const that = this;

    return new TransformStream({
      start(controller) {
        this.filePos = 0;
      },
      transform(chunk, controller) {
        console.log(chunk);
        controller.enqueue(chunk);
        const buffer = new ArrayBuffer(chunk.byteLength);
        new Uint8Array(buffer).set(chunk);
        buffer.fileStart = this.filePos;
        this.filePos += buffer.byteLength;
        that.mp4Box.appendBuffer(buffer);
        // that.mp4Box.
      },
    });
  }

  EncodeVideoStream(self, config) {
    const that = this;

    return new TransformStream({
      start(controller) {
        this.frameCounter = 0;
        this.seqNo = 0;
        this.keyframeIndex = 0;
        this.deltaframeIndex = 0;
        this.filePos = 0;
        this.startTime = Date.now() / 1000;
        this.pending_outputs = 0;
        this.chunkArray = [];
        this.count = 0;

        // this.segmentArrayOfFrames = [];
        // this.log = () => {
        //   this.segmentArrayOfFrames.push(videoChunks);
        //   console.log(this.segmentArrayOfFrames);
        // };

        // let segmentNumber = 0;
        // var segmentDuration = 3; //in seconds

        // let id = 0;
        console.log("Inside Encode Video Stream");

        // // this.mp4Box = new MP4Box();
        this.mp4Box = mp4Box;
        var mp4boxfile = this.mp4Box.createFile({ meta: true });

        let fileStart = 0;
        let outputFileName = "";
        let track = null;
        const frameDuration = 5_000_000; // 5Mbps

        mp4boxfile.onReady = function () {
          console.log("Received File Information");

          console.log("moov object:", mp4boxfile.moov);

          // // access moov object and its associated metadata
          var duration = mp4boxfile.moov.mvhd.duration;
          var trackCount = mp4boxfile.moov.traks.length;

          // do something with duration and trackCount
          console.log("Duration:", duration);
          console.log("Track Count:", trackCount);

          var info = mp4boxfile.getInfo();

          mp4boxfile.setSegmentOptions(info.tracks[0].id);

          mp4boxfile.setSegmentOptions({ format: "mp4" });

          mp4boxfile.setSegmentOptions({ segmentDuration: 3 });
          mp4boxfile.start();
        };

        mp4boxfile.onSegment = (id, user, buffer, sampleNum, isLast) => {
          // Send the video segment to the server
          console.log("Inside onSegment method");

          const blob = new Blob([buffer], { type: "video/mp4" });
          const formData = new FormData();
          formData.append("segment", blob, `${id}_segment${segmentNumber}.mp4`);
          console.log("Segment created ");
          //sendFormDataToServer(formData);
          console.log("aa", formData.getAll("segment"));
          outputFileName = formData.get("segment").name;
          const file = formData.getAll("segment")[0];

          self.postMessage({ data: buffer, type: "data" }, [buffer]);
          // If this is the last segment, reset the segment number
          if (isLast) {
            segmentNumber = 0;
          }
        };

        mp4boxfile.onMoovStart = function () {
          console.log("Starting to receive File Information");
        };

        mp4boxfile.onError = function (error) {
          console.error("Error parsing MP4 file:", error);
        };

        this.encoder = encoder = new VideoEncoder({
          output: (chunk, cfg) => {
            console.log(chunk);

            console.log("Frame Counter: ", this.frameCounter);
            console.log("key interval: ", config.keyInterval);
            //console.log("count:", count);
            // const uint8Array = new Uint8Array(chunk.byteLength);
            // console.log("buffer: ", uint8Array);
            // chunk.copyTo(uint8Array);
            // const buffer = uint8Array.buffer;

            const uint8Array = new Uint8Array(chunk.byteLength);
            chunk.copyTo(uint8Array);
            buffer = uint8Array.buffer;
            mp4boxfile.addSample(track, buffer, {
              duration: frameDuration,
            });

            buffer.fileStart = fileStart; // Set the fileStart property to 0
            fileStart += buffer.byteLength;
            console.log("fileStart:", fileStart);
            console.log("mp4boxFileObject: ", mp4boxfile);
            console.log("buffer data: ", buffer);
            mp4boxfile.appendBuffer(buffer);

            if (this.frameCounter % config.keyInterval == 0) {
              console.log("mp4boxFile after appending Buffer:", mp4boxfile);
              // mp4boxfile.onReady();
              // mp4boxfile.onSegment(count, null, buffer);
              self.postMessage({ data: buffer, type: "data" }, [buffer]);
              mp4boxfile.flush();
            }

            // videoChunks.push(chunk);
            // if (chunk.type === "key") console.log(chunk);
            //   console.log(chunk);
            // this.count++;

            // that.mp4Box.c;
            // console.log("first", that.mp4Box);
            // console.log(that.mp4Box);
            // const arrayBuffer = chunk; // toArrayBuffer(chunk);

            // console.log(chunk);

            // const chunkData = new Uint8Array(chunk.byteLength);
            // chunk.copyTo(chunkData);

            // // if (that.track === null) {
            // //   // trackOptions.avcDecoderConfigRecord = config.decoderConfig.description;
            // //   that.track = that.mp4Box.addTrack({
            // //     timescale: 1000 * 3000,
            // //     width: 1280,
            // //     height: 720,
            // //     nb_samples: 90,
            // //   });
            // // }

            // const buffer = chunkData.buffer;

            // ////

            // const trackId = 1; // the track ID of the video track

            // // Create an ISO BMFF fragment with the video frame data
            // // const data = new Uint8Array(frameData);
            // const mdatBox = that.mp4Box. // exclude the NALU length field
            // const fragment = that.mp4Box.concatenate([mdatBox.buffer]);

            // // Append the fragment to the video track using mp4box
            // that.mp4Box.appendBuffer(fragment, trackId);

            // //
            // // // const frameData = chunk.cloneData();
            // // console.log(that.mp4Box);
            // // // console.log(frameData);

            // // // console.log(buffer.fileStart);
            // // // console.log(arrayBuffer);
            // // // that.mp4Box.addSample(that.track, chunkData, {
            // // //   duration: (1000 / 30) * 1000,
            // // // });
            // // that.mp4Box.appendBuffer(buffer);
            // // that.mp4Box.appendBuffer(buffer);
            // // that.mp4Box.appendBuffer(buffer);
            // // console.log(this.startTime - Date.now());
            // if (Date.now() / 1000 - this.startTime >= 3) {
            //   console.log("aa");
            3;
            //   // addFramesToVideo2(this.chunkArray);
            //   // addFramesToBuffer(this.chunkArray);
            //   mux(this.chunkArray, cfg);
            //   this.startTime = Date.now() / 1000;
            // }

            // if (cfg?.encoderState === "closed") {
            //   // that.mp4Box.flush();
            //   console.log("fsirst");
            //   videoBuffer = mediaSource.addSourceBuffer(
            //     'video/mp4; codecs="avc1.42E01E"'
            //   );
            //   videoBuffer.addEventListener("updateend", handleUpdateEnd);
            //   concatChunks(videoChunks).then((data) => {
            //     videoBuffer.appendBuffer(data);
            //   });
            // }

            if (cfg.decoderConfig) {
              const decoderConfig = JSON.stringify(cfg.decoderConfig);
              self.postMessage({ text: "Configuration: " + decoderConfig });
              const configChunk = {
                type: "config",
                seqNo: this.seqNo,
                keyframeIndex: this.keyframeIndex,
                deltaframeIndex: this.deltaframeIndex,
                timestamp: 0,
                pt: 0,
                config: decoderConfig,
              };
              controller.enqueue(configChunk);
            }
            // chunk.temporalLayerId = 0;
            if (cfg.svc) {
              chunk.temporalLayerId = cfg.svc.temporalLayerId;
            }
            this.seqNo++;
            if (chunk.type == "key") {
              this.keyframeIndex++;
              this.deltaframeIndex = 0;
            } else {
              this.deltaframeIndex++;
            }
            this.pending_outputs--;
            chunk.seqNo = this.seqNo;
            chunk.keyframeIndex = this.keyframeIndex;
            chunk.deltaframeIndex = this.deltaframeIndex;
            controller.enqueue(chunk);

            console.log(chunk);

            // this.chunkArray.push(chunk);

            // this.count++;
            // if (this.count === 90) {
            //   mux(this.chunkArray, config);
            //   this.chunkArray = [];
            //   // this.log();
            //   // that.mp4Box.flush();
            //   this.count = 0;
            // }

            // const buffer = new ArrayBuffer(chunk.byteLength);
            // new Uint8Array(buffer).set(chunk);
            // buffer.fileStart = this.filePos;
            // this.filePos += buffer.byteLength;
            // // that.mp4Box.appendBuffer(buffer);
            // var info = that.mp4Box.getInfo();
            // console.log(info);
          },
          error: (e) => {
            self.postMessage({
              severity: "fatal",
              text: `Encoder error: ${e.message}`,
            });
          },
        });
        VideoEncoder.isConfigSupported(config)
          .then((encoderSupport) => {
            if (encoderSupport.supported) {
              this.encoder.configure(encoderSupport.config);
              console.log("sucess cfg");
              self.postMessage({
                text:
                  "Encoder successfully configured:\n" +
                  JSON.stringify(encoderSupport.config),
              });
            } else {
              self.postMessage({
                severity: "fatal",
                text:
                  "Config not supported:\n" +
                  JSON.stringify(encoderSupport.config),
              });
            }
          })
          .catch((e) => {
            self.postMessage({
              severity: "fatal",
              text: `Configuration error: ${e.message}`,
            });
          });
      },
      transform(frame, controller) {
        if (this.pending_outputs <= 30) {
          this.pending_outputs++;
          console.log("Frame counter:", this.frameCounter);
          console.log("KeyInterval configuration:", config.keyInterval);
          const insert_keyframe = this.frameCounter % config.keyInterval == 0;
          this.frameCounter++;
          try {
            if (this.encoder.state != "closed") {
              const queue = this.encoder.encodeQueueSize;
              encqueue_update(queue);

              this.encoder.encode(frame, { keyFrame: insert_keyframe });
            }
          } catch (e) {
            self.postMessage({
              severity: "fatal",
              text: "Encoder Error: " + e.message,
            });
          }
        }
        frame.close();
      },
    });
  }

  // handleSegmentUpdateEnd() {
  //   const segmentBuffer = segmentBuffers.shift();
  //   mediaSource.removeSourceBuffer(segmentBuffer);
  // }

  // async handleUpdateEnd() {
  //   if (!videoBuffer.updating) {
  //     const blob = new Blob([videoChunks.shift()], { type: "video/mp4" });
  //     const url = URL.createObjectURL(blob);
  //     const response = await fetch(url);
  //     if (response.ok) {
  //       const m = new mp4Box();
  //       const data = await response.arrayBuffer();
  //       const boxes = m.parseBuffer(data);
  //       const init = boxes.filter(
  //         (box) => box.type === "ftyp" || box.type === "moov"
  //       );
  //       const fragments = boxes.filter(
  //         (box) => box.type === "moof" || box.type === "mdat"
  //       );
  //       if (init.length > 0) {
  //         videoBuffer.appendBuffer(init[0].data);
  //       }
  //       for (const fragment of fragments) {
  //         videoBuffer.appendBuffer(fragment.data);
  //         if (fragment.type === "mdat") {
  //           videoDuration += fragment.duration; // add duration of fragment to video duration
  //           if (videoDuration >= segmentDuration) {
  //             // if video duration exceeds segment duration, create new segment
  //             const segmentData = videoBuffer.buffer.slice(0); // clone video buffer data
  //             console.log(segmentData);
  //             const segmentBuffer = new SourceBuffer();
  //             mediaSource.addSourceBuffer(segmentBuffer);
  //             segmentBuffer.addEventListener(
  //               "updateend",
  //               handleSegmentUpdateEnd
  //             );
  //             segmentBuffers.push(segmentBuffer);
  //             videoBuffer.remove(0, videoBuffer.buffered.end(0)); // remove appended data from video buffer
  //             videoBuffer.appendBuffer(segmentData);
  //             videoDuration = 0;
  //             currentSegment++;
  //           }
  //         }
  //       }
  //     }
  //   }
  // }

  stop() {
    if (stopped) return;
    stopped = true;
    this.stopped = true;
    self.postMessage({ text: "stop() called" });
    if (encoder.state != "closed") encoder.close();
    if (decoder.state != "closed") decoder.close();
    self.postMessage({ text: "stop(): frame, encoder and decoder closed" });
    return;
  }

  async start() {
    if (stopped) return;
    // const mf = mp4Box.createFile();
    started = true;
    // const outputFilePath = "chunk_%d.mp4";
    let duplexStream, readStream, writeStream;
    self.postMessage({ text: "Start method called." });
    try {
      await this.inputStream
        .pipeThrough(this.EncodeVideoStream(self, this.config))
        // .pipeThrough(this.Mp4Segment(self))
        .pipeThrough(this.DecodeVideoStream(self))
        .pipeTo(this.outputStream);
    } catch (e) {
      self.postMessage({
        severity: "fatal",
        text: `start error: ${e.message}`,
      });
    }
  }
}
