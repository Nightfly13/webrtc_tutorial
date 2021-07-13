const webSocket = new WebSocket("ws://127.0.0.1:3000");

const videoElement = document.querySelector("video#remote-video");
const audioInputSelect = document.querySelector("select#audioSource");
const audioOutputSelect = document.querySelector("select#audioOutput");
const videoSelect = document.querySelector("select#videoSource");
const selectors = [audioInputSelect, audioOutputSelect, videoSelect];
audioOutputSelect.disabled = !("sinkId" in HTMLMediaElement.prototype);
let username;
let peerConn;
let isAudio = true;
let isVideo = true;

//websocket stuff
webSocket.onmessage = (event) => {
  handleSignallingData(JSON.parse(event.data));
};

function handleSignallingData(data) {
  switch (data.type) {
    case "answer":
      peerConn.setRemoteDescription(data.answer);
      break;
    case "offer":
      peerConn.setRemoteDescription(data.offer);
      createAndSendAnswer();
      break;
    case "candidate":
      peerConn.addIceCandidate(data.candidate);
  }
}

//functions for sending data
function sendUsername() {
  username = document.getElementById("username-input").value;
  sendData({
    type: "store_user",
  });
}

function sendData(data) {
  data.username = username;
  webSocket.send(JSON.stringify(data));
}

function createAndSendOffer() {
  peerConn.createOffer(
    (offer) => {
      sendData({
        type: "store_offer",
        offer: offer,
      });

      peerConn.setLocalDescription(offer);
    },
    (error) => {
      console.log(error);
    }
  );
}

function createAndSendAnswer() {
  peerConn.createAnswer(
    (answer) => {
      peerConn.setLocalDescription(answer);
      console.log(answer);
      sendData({
        type: "send_answer",
        answer: answer,
      });
    },
    (error) => {
      console.log(error);
    }
  );
}
//apply video source to call
function gotStream(stream) {
  document.getElementById("local-video").srcObject = stream;

  let configuration = {
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
        ],
      },
    ],
  };

  peerConn = new RTCPeerConnection(configuration);
  peerConn.addStream(stream);

  peerConn.onaddstream = (e) => {
    document.getElementById("remote-video").srcObject = e.stream;
  };

  peerConn.onicecandidate = (e) => {
    if (e.candidate == null) return;
    sendData({
      type: "store_candidate",
      candidate: e.candidate,
    });
  };

  peerConn.onnegotiationneeded = (e) => {
    createAndSendOffer();
  };

  return navigator.mediaDevices.enumerateDevices();
}

//Mute functions for video and audio
function muteAudio() {
  isAudio = !isAudio;
  peerConn.getSenders()[0].track.enabled = isAudio;
  document.getElementById("muteAudio").style.backgroundColor = isAudio
    ? "green"
    : "red";
}

function muteVideo() {
  isVideo = !isVideo;
  peerConn.getSenders()[1].track.enabled = isVideo;
  document.getElementById("muteVideo").style.backgroundColor = isVideo
    ? "green"
    : "red";
}

//handle device selector
function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map((select) => select.value);
  selectors.forEach((select) => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    const option = document.createElement("option");
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === "audioinput") {
      option.text =
        deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
      audioInputSelect.appendChild(option);
    } else if (deviceInfo.kind === "audiooutput") {
      option.text =
        deviceInfo.label || `speaker ${audioOutputSelect.length + 1}`;
      audioOutputSelect.appendChild(option);
    } else if (deviceInfo.kind === "videoinput") {
      option.text = deviceInfo.label || `camera ${videoSelect.length + 1}`;
      videoSelect.appendChild(option);
    } else {
      console.log("Some other kind of source/device: ", deviceInfo);
    }
  }
  selectors.forEach((select, selectorIndex) => {
    if (
      Array.prototype.slice
        .call(select.childNodes)
        .some((n) => n.value === values[selectorIndex])
    ) {
      select.value = values[selectorIndex];
    }
  });
}

function handleError(error) {
  console.log(
    "navigator.MediaDevices.getUserMedia error: ",
    error.message,
    error.name
  );
}

//functions for changing sources and destinations for stream
function changeAudioDestination() {
  const audioDestination = audioOutputSelect.value;
  if (typeof videoElement.sinkId !== "undefined") {
    videoElement
      .setSinkId(audioDestination)
      .then(() => {
        console.log(
          `Success, audio output device attached: ${audioDestination}`
        );
      })
      .catch((error) => {
        let errorMessage = error;
        if (error.name === "SecurityError") {
          errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`;
        }
        console.error(errorMessage);
        // Jump back to first output device in the list as it's the default.
        audioOutputSelect.selectedIndex = 0;
      });
  } else {
    console.warn("Browser does not support output device selection.");
  }
}

function changeAudioSource() {
  const audioSource = audioInputSelect.value;
  const constraints = {
    audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
  };
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    stream.getAudioTracks()[0].enabled = isAudio;
    peerConn.getSenders()[0].replaceTrack(stream.getAudioTracks()[0]);
  });
}

function changeVideoSource() {
  const videoSource = videoSelect.value;
  const constraints = {
    video: { deviceId: videoSource ? { exact: videoSource } : undefined },
  };
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    stream.getVideoTracks()[0].enabled = isVideo;
    peerConn.getSenders()[1].replaceTrack(stream.getVideoTracks()[0]);
  });
}

//initialize call
function startCall() {
  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
  document.getElementById("video-call-div").style.display = "inline";
  const audioSource = audioInputSelect.value;
  const videoSource = videoSelect.value;
  const constraints = {
    audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
    video: { deviceId: videoSource ? { exact: videoSource } : undefined },
  };
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(gotStream)
    .then(gotDevices)
    .catch(handleError);
}

audioInputSelect.onchange = changeAudioSource;
audioOutputSelect.onchange = changeAudioDestination;
videoSelect.onchange = changeVideoSource;
navigator.mediaDevices.enumerateDevices().then(gotDevices).catch(handleError);
