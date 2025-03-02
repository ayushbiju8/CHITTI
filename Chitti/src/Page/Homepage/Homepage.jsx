import React, { useState, useEffect } from "react";
import axios from "axios";
import "./Homepage.css";

const Homepage = () => {
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState([
    { text: "Hi, I'm Chitti. How can I help you today?", isUser: false }
  ]);
  const [isWaveAnimating, setIsWaveAnimating] = useState(false);
  const [inputText, setInputText] = useState(""); // State for text input

  useEffect(() => {
    const chatContainer = document.getElementById("chat-messages");
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  const sendTextToBackend = async (text) => {
    try {
      const response = await axios.post("http://localhost:8000/api/v1/cybercrime/receive", { text });
  
      if (response.data && response.data.data && response.data.data.message) {
        const messageData = response.data.data.message;
        
        // Extract text between <data> and </data> (handling any content inside)
        const extractedMessage = messageData.split("<data>")[1]?.split("</data>")[0] || "I'm not sure how to respond.";
  
        // Add AI response to chat
        const aiMessage = { text: extractedMessage, isUser: false };
        setMessages((prev) => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error("Error sending text to backend:", error);
    }
  };

const toggleListening = () => {
  if (!isListening) {
    setIsListening(true);
    setIsWaveAnimating(true);
    recognition.continuous = false; // Stop after capturing speech
    recognition.interimResults = false; // Only final results
    recognition.start();

    let stopTimeout; // Variable to store timeout reference

    recognition.onstart = () => {
      console.log("Voice recognition started...");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log("Recognized Speech:", transcript);

      setMessages((prev) => [...prev, { text: transcript, isUser: true }]);
      sendTextToBackend(transcript);

      // Clear any existing timeout and start a new one
      clearTimeout(stopTimeout);
      stopTimeout = setTimeout(() => {
        recognition.stop();
      }, 2000); // Stops after 2 seconds of inactivity
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setIsWaveAnimating(false);
    };

    recognition.onend = () => {
      console.log("Voice recognition stopped.");
      setIsListening(false);
      setIsWaveAnimating(false);
    };
  }
};


  const handleSendMessage = () => {
    if (inputText.trim() === "") return;

    const newUserMessage = { text: inputText, isUser: true };
    setMessages((prev) => [...prev, newUserMessage]);
    setInputText("");

    // Send the typed text to the backend
    sendTextToBackend(inputText);
  };

  const handleInputKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  return (
    <div className="body">
      <canvas id="ambient-canvas" className="ambient-background"></canvas>

      <div className="whole">
        <div className="glowing-orb top-left"></div>
        <div className="glowing-orb bottom-right cxx"></div>

        <div className="topLogo">
          <div className="logo-text">CHITTI</div>
          <div className="logo-tagline">your intelligent companion</div>
        </div>

        <div className="centerHolder">
          <div className={`mic ${isListening ? "active" : ""}`} onClick={toggleListening}>
            <i className="mic-icon"></i>
            <div className="mic-shadow"></div>
            <div className="mic-rings"></div>

            {isWaveAnimating && (
              <div className="audio-waves">
                <div className="audio-wave"></div>
                <div className="audio-wave"></div>
                <div className="audio-wave"></div>
                <div className="audio-wave"></div>
                <div className="audio-wave"></div>
                <div className="audio-wave"></div>
              </div>
            )}
          </div>

          <div className="status-text">
            {isListening ? "Listening..." : "Tap to speak"}
          </div>
        </div>

        <div className="chat">
          <div className="chat-header">
            <div className="chat-handle"></div>
          </div>

          <div className="chat-container">
            <div id="chat-messages" className="messages-container">
              {messages.map((message, index) => (
                <div key={index} className={`message ${message.isUser ? "user-message" : "ai-message"}`}>
                  {!message.isUser && (
                    <div className="ai-avatar">
                      <div className="avatar-inner">C</div>
                    </div>
                  )}
                  <div className="message-bubble">{message.text}</div>
                </div>
              ))}
            </div>

            {/* Input field and send button */}
            <div className="chat-input-container">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleInputKeyPress}
                placeholder="Type a message..."
                className="chat-input"
              />
              <button onClick={handleSendMessage} className="send-button">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;