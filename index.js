require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { IamAuthenticator } = require("ibm-watson/auth");
const SpeechToTextV1 = require("ibm-watson/speech-to-text/v1");
const TextToSpeechV1 = require("ibm-watson/text-to-speech/v1");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const PDFDocument = require("pdfkit");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public")); // Serve static files from 'public'

// IBM Watson Services Configuration
const speechToText = new SpeechToTextV1({
  authenticator: new IamAuthenticator({ apikey: process.env.WATSON_API_KEY }),
  serviceUrl: process.env.WATSON_URL,
});

const textToSpeech = new TextToSpeechV1({
  authenticator: new IamAuthenticator({ apikey: process.env.TEXT_TO_SPEECH_API_KEY }),
  serviceUrl: process.env.TEXT_TO_SPEECH_URL,
});

// Multer Configuration for File Uploads
const upload = multer({ dest: "uploads/" });

// Speech-to-Text Endpoint
app.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    const audioFilePath = req.file.path;

    // Speech-to-Text Recognition
    const recognizeParams = {
      audio: fs.createReadStream(audioFilePath),
      contentType: "audio/wav",
      model: "en-US_BroadbandModel",
    };

    const response = await speechToText.recognize(recognizeParams);
    const transcription = response.result.results
      .map((result) => result.alternatives[0].transcript)
      .join(" ");

    fs.unlinkSync(audioFilePath); // Delete the uploaded file after processing

    // Create DOCX File
    const docxFilePath = path.join(__dirname, "transcription.docx");
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [new TextRun(transcription)],
            }),
          ],
        },
      ],
    });

    const docBuffer = await Packer.toBuffer(doc);
    fs.writeFileSync(docxFilePath, docBuffer);

    // Create PDF File
    const pdfFilePath = path.join(__dirname, "transcription.pdf");
    const pdfDoc = new PDFDocument();
    pdfDoc.pipe(fs.createWriteStream(pdfFilePath));
    pdfDoc.text(transcription);
    pdfDoc.end();

    res.send({
      message: "Transcription completed",
      files: {
        docx: `/download/docx`,
        pdf: `/download/pdf`,
      },
    });
  } catch (error) {
    console.error("Error processing audio file:", error);
    res.status(500).send("Error processing audio file.");
  }
});

// Text-to-Speech Endpoint
app.post("/text-to-speech", async (req, res) => {
  try {
    const { text } = req.body;

    // Text-to-Speech Synthesis
    const synthesizeParams = {
      text: text,
      accept: "audio/mp3",
      voice: "ja-JP_EmiV3Voice",
    };

    const audioResponse = await textToSpeech.synthesize(synthesizeParams);
    const audioBuffer = await textToSpeech.repairWavHeaderStream(audioResponse.result);

    // Save Audio File
    const audioFilePath = path.join(__dirname, "output.mp3");
    fs.writeFileSync(audioFilePath, audioBuffer);

    res.send({
      message: "Text-to-Speech conversion completed",
      audioFile: `/download/audio`,
    });
  } catch (error) {
    console.error("Error processing text to speech:", error);
    res.status(500).send("Error processing text to speech.");
  }
});

// Serve Downloadable Files
app.get("/download/:type", (req, res) => {
  const fileType = req.params.type;
  const filePath =
    fileType === "docx"
      ? path.join(__dirname, "transcription.docx")
      : fileType === "pdf"
      ? path.join(__dirname, "transcription.pdf")
      : fileType === "audio"
      ? path.join(__dirname, "output.mp3")
      : null;

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found.");
  }

  res.download(filePath);
});

// Start Server
app.listen(5500, () => console.log("Server running on http://localhost:5500"));
