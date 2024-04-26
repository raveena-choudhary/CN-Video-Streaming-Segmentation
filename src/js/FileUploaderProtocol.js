class FileUploaderProtocol {
  //   static endpoint = "http://localhost:3000/upload";
  #seqNo = 0;
  #queue = null;
  #sending = null;

  constructor() {
    this.#queue = [];
    this.#sending = false;
  }

  enqueueFile(blob) {
    this.#queue.push(blob);
    this.#sendNextFile();
  }

  #sendFile(blob, fileName) {
    const formData = new FormData();
    console.log(`#Sending File "${fileName}" seqNo ${this.#seqNo}`);
    formData.set("file", blob, fileName);
    formData.set("seqNo", this.#seqNo);

    return fetch("http://localhost:3000/upload", {
      method: "post",
      body: formData,
    });
  }

  async #sendNextFile() {
    if (this.#sending || this.#queue.length === 0) {
      return;
    }

    const blob = this.#queue[0];
    const fileName = "segment-" + this.#seqNo + ".mp4";
    this.#sending = true;

    try {
      const res = await this.#sendFile(blob, fileName);
      console.log(res);
      console.log(`File "${fileName}" uploaded successfully`);
      this.#queue.shift();
      this.#seqNo++;
    } catch (error) {
      console.error(`Error uploading file "${fileName}": ${error.message}`);
    }

    this.#sending = false;
    this.#sendNextFile();
  }
}

export default FileUploaderProtocol;
