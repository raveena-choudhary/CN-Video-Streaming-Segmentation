import RecordRTC from "recordrtc";
import FileUploaderProtocol from "./FileUploaderProtocol";
// RecordRTC.
let recorder = null;
let intt;
const fileUploaderProtocol = new FileUploaderProtocol();
function captureVideo(videoInput) {
  navigator.mediaDevices
    .getUserMedia({
      video: true,
      audio: false,
    })
    .then(function (stream) {
      videoInput.srcObject = stream;
      videoInput.play();
      recorder = RecordRTC(stream, {
        type: "video",

        mimeType: "video/mp4",

        // get intervals based blobs
        // value in milliseconds
        // timeSlice: 3000,

        ondataavailable: function (blob) {
          // callback function that receives a recorded segment as a Blob object
          // encode the blob using Base64 or some other encoding format
          console.log(blob);
          // RecordRTC.getSeekableBlob(blob, function (seekableBlob) {

          // });
          //   downloadBlob(blob);

          var reader = new FileReader();
          reader.onloadend = function () {
            // callback function that receives the encoded data as a string
            var encodedData = reader.result;
            console.log(encodedData);
            // send the encoded data to the server or save it locally
            // ...
          };
          reader.readAsDataURL(blob);
        },

        // auto stop recording if camera stops
        checkForInactiveTracks: false,

        // requires timeSlice above
        onTimeStamp: function (timestamp) {
          console.log(timestamp);
          // console.log(recorder.getBlob());
        },

        // only for video track
        videoBitsPerSecond: 500000,

        // it is kind of a "frameRate"
        frameInterval: 30,

        previewStream: function (stream) {},

        video: HTMLVideoElement,

        canvas: {
          width: 1280,
          height: 720,
        },

        // used by StereoAudioRecorder
        // the range 22050 to 96000.
        sampleRate: 96000,

        // used by StereoAudioRecorder
        // the range 22050 to 96000.
        // let us force 16khz recording:
        desiredSampRate: 16000,

        // used by StereoAudioRecorder
        // Legal values are (256, 512, 1024, 2048, 4096, 8192, 16384).
        bufferSize: 16384,

        // // used by WebAssemblyRecorder
        // frameRate: 30,

        // // used by WebAssemblyRecorder
        // bitrate: 128000,

        // // used by MultiStreamRecorder - to access HTMLCanvasElement
        // elementClass: "multi-streams-mixer",
      });

      recorder.startRecording();
    });

  // stop recording after 3 seconds
  let i = 0;
  intt = setInterval(function () {
    recorder.stopRecording(function () {
      // get the recorded blob
      // const timestamp = new Date().toISOString(); // get current timestamp in ISO format
      // const fileName = `myfile_${i++}.mp4`;
      var blob = recorder.getBlob();
      // console.log(blob);
      fileUploaderProtocol.enqueueFile(blob);
      // const fd = new FormData();
      // fd.set("file", blob, fileName);
      // fetch("http://localhost:3000/upload", {
      //   method: "post",
      //   body: fd,
      // });
      // const link = document.createElement("a");
      // link.href = URL.createObjectURL(blob);
      // // debugger;
      // console.log("link:", link.href);
      // link.download = fileName;
      // link.click();
      recorder.startRecording();
    });
  }, 3000);
}

function init() {
  const videoInput = document.getElementById("inputVideo");
  captureVideo(videoInput);
}
init();
const startButton = document.getElementById("start");
startButton.addEventListener("click", () => {
  console.log("Start recording..........");
  init(); //start Recording
});

const stopButton = document.getElementById("stop");
stopButton.addEventListener("click", () => {
  console.log("Start recording..........");
  clearInterval(intt);
});

const showUploadedSegmentsData = document.getElementById(
  "showUploadedSegmentsData"
);
showUploadedSegmentsData.addEventListener("click", () => {
  fetch("http://localhost:3000/files")
    .then((res) => res.json())
    .then((data) => {
      const ele = document.getElementById("data");
      ele.innerHTML = JSON.stringify(data, null, 4);
      console.log(data);
    });
});
