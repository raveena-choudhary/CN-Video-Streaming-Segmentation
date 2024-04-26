const streamWorker = new Worker(new URL("worker.js", import.meta.url), {
  type: "module",
});

const settings = {
  width: 1280,
  height: 720,
};

const options = (ssrc) => ({
  alpha: "discard",
  // codec: "vp09.00.10.08", //webm
  codec: "avc1.42002A", //H264
  // codec: "vp09.00.10.08", //H264
  // avc: { format: "annexb" },
  // pt: 1,
  framerate: 30, //30fps
  bitrate: 50000, // 5Mbps
  width: settings.width,
  height: settings.height,
  // type: "video/webm",
  ssrc: ssrc,
  bitrateMode: "constant",
  latencyMode: "realtime",
  keyInterval: 90, // 30frames for 3 seconds // i frame every 90 frames
  hardwareAcceleration: "prefer-hardware",

  // scalabilityMode: "L1T2",
});

async function captureVideo(videoInput) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });

  videoInput.srcObject = stream;
  videoInput.play();

  return stream;
}

const startCapture = async (track) => {
  const processor = new MediaStreamTrackProcessor(track);
  console.log(processor);
  const inputStream = processor.readable;

  const generator = new MediaStreamTrackGenerator({ kind: "video" });
  const outputStream = generator.writable;
  document.getElementById("outputVideo").srcObject = new MediaStream([
    generator,
  ]);

  let ssrcArr = new Uint32Array(1);
  window.crypto.getRandomValues(ssrcArr);
  const ssrc = ssrcArr[0];

  streamWorker.postMessage(
    {
      type: "stream",
      config: options(ssrc),
      streams: { input: inputStream, output: outputStream },
    },
    [inputStream, outputStream]
  );
};

const stopStream = () => {
  streamWorker.postMessage({
    type: "stop",
  });
};

streamWorker.addEventListener("message", async ({ data }) => {
  console.log("data", data);
});

const init = async () => {
  const videoInput = document.getElementById("inputVideo");
  const stopBtn = document.getElementById("stopBtn");
  stopBtn.addEventListener("click", stopStream);
  const stream = await captureVideo(videoInput);
  const track = stream.getVideoTracks()[0];

  const capabilties = track.getCapabilities();

  if (capabilties.width) {
    settings.width = Math.min(capabilties.width.max, settings.width);
  }
  if (capabilties.height) {
    settings.height = Math.min(capabilties.height.max, settings.height);
  }

  await track.applyConstraints({
    width: settings.width,
    height: settings.height,
  });

  startCapture(track, settings);
};

init();
// captureFromEncoded();
// init2();
