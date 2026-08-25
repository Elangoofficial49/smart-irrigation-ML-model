/**
 * Smart Irrigation AI Assistant ("AgroBot" / "விவசாய வழிகாட்டி")
 * Multilingual Voice & Text Chatbot supporting English and Tamil (தமிழ்)
 * with Speech Recognition (Microphone) and Crystal-Clear Server-Backed
 * High-Clarity Audio Speech Streaming (/api/tts).
 */

(function () {
  let currentLang = localStorage.getItem("agrobot_lang") || "en"; // "en" or "ta"
  let voiceEnabled = localStorage.getItem("agrobot_voice") !== "false"; // default true
  let isListening = false;
  let recognition = null;
  let synth = window.speechSynthesis;
  let currentAudio = null;

  // Initialize Speech Recognition if supported
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
  }

  // Inject Widget DOM
  function injectWidget() {
    if (document.getElementById("agrobotWidget")) return;

    const widgetDiv = document.createElement("div");
    widgetDiv.id = "agrobotWidget";
    widgetDiv.innerHTML = `
      <!-- Floating Trigger Button -->
      <button id="agrobotToggleBtn" class="agrobot-trigger" title="AI Farm Assistant | விவசாய வழிகாட்டி" aria-label="Open AI Assistant">
        <div class="agrobot-trigger-avatar">
          <i class="fa-solid fa-robot"></i>
        </div>
        <span class="agrobot-trigger-badge">AI</span>
      </button>

      <!-- Chat Window -->
      <div id="agrobotWindow" class="agrobot-window">
        <!-- Header -->
        <div class="agrobot-header">
          <div class="agrobot-header-info">
            <div class="agrobot-status-indicator"></div>
            <div>
              <div class="agrobot-title" id="agrobotHeaderTitle">${translations[currentLang].title}</div>
              <div class="agrobot-subtitle" id="agrobotHeaderSubtitle">${translations[currentLang].subtitle}</div>
            </div>
          </div>
          <div class="agrobot-header-actions">
            <!-- Language Switcher -->
            <div class="agrobot-lang-switch">
              <button type="button" class="lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" title="English">EN</button>
              <button type="button" class="lang-btn ${currentLang === 'ta' ? 'active' : ''}" data-lang="ta" title="தமிழ்">தமிழ்</button>
            </div>
            <!-- Voice Mute Toggle -->
            <button type="button" id="agrobotVoiceToggle" class="agrobot-icon-btn ${voiceEnabled ? 'active' : ''}" title="Toggle Voice Output">
              <i class="fa-solid ${voiceEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>
            </button>
            <!-- Close Button -->
            <button type="button" id="agrobotCloseBtn" class="agrobot-icon-btn" title="Close">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Live Speaking Indicator -->
        <div id="agrobotSpeakingBar" class="agrobot-speaking-bar" style="display:none;">
          <div class="sound-wave">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <span id="agrobotSpeakingText">AgroBot is speaking...</span>
          <button type="button" id="agrobotStopSpeechBtn" class="btn-stop-speech" title="Stop Voice"><i class="fa-solid fa-stop"></i></button>
        </div>

        <!-- Messages Container -->
        <div id="agrobotMessages" class="agrobot-messages"></div>

        <!-- Quick Prompt Chips -->
        <div id="agrobotChips" class="agrobot-chips"></div>

        <!-- Input Area -->
        <form id="agrobotForm" class="agrobot-input-area">
          <!-- Voice Input Mic Button -->
          <button type="button" id="agrobotMicBtn" class="agrobot-mic-btn" title="Speak into Microphone (Voice Input)">
            <i class="fa-solid fa-microphone"></i>
          </button>
          <input type="text" id="agrobotInput" class="agrobot-input" placeholder="${translations[currentLang].placeholder}" autocomplete="off">
          <button type="submit" id="agrobotSendBtn" class="agrobot-send-btn" title="Send message">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(widgetDiv);
    bindEvents();
    renderChips();
    sendGreeting();
  }

  const translations = {
    en: {
      title: "AgroBot AI Assistant",
      subtitle: "Precision Farm Guide &bull; Tamil & English",
      placeholder: "Ask anything about your farm, moisture, weather...",
      speaking: "AgroBot is speaking...",
      listening: "Listening... Speak now",
      welcome: "Hello! 👋 I am **AgroBot**, your Precision Agriculture Guide. How can I assist your crops and irrigation today?",
      chips: [
        { label: "💧 Irrigate Now?", text: "Should I turn on irrigation now?" },
        { label: "📊 Soil Moisture", text: "What is the current soil moisture reading?" },
        { label: "⛅ Weather Report", text: "What is today's weather forecast?" },
        { label: "🎋 Sugarcane Care", text: "How to manage sugarcane irrigation?" },
        { label: "🌾 Paddy Care", text: "What is the best irrigation for paddy?" },
        { label: "❓ Help & Guide", text: "How to use this platform?" }
      ]
    },
    ta: {
      title: "AgroBot விவசாய வழிகாட்டி",
      subtitle: "துல்லிய பண்ணை AI &bull; தமிழ் வழிகாட்டி",
      placeholder: "மண் ஈரப்பதம், நீர்ப்பாசனம் அல்லது பயிர் பற்றி கேளுங்கள்...",
      speaking: "AgroBot பேசுகிறது...",
      listening: "கேட்கிறது... இப்போது பேசுங்கள்",
      welcome: "வணக்கம்! 🙏 நான் உங்கள் **AgroBot விவசாய வழிகாட்டி**. உங்கள் பயிர் மற்றும் நீர்ப்பாசனத்திற்கு நான் எவ்வாறு உதவ வேண்டும்?",
      chips: [
        { label: "💧 தண்ணீர் பாய்ச்சலாமா?", text: "இப்போது தண்ணீர் பாய்ச்சலாமா?" },
        { label: "📊 மண் ஈரப்பதம்", text: "மண் ஈரப்பதம் எவ்வளவு இருக்கிறது?" },
        { label: "⛅ வானிலை அறிக்கை", text: "இன்றைய வானிலை அறிக்கை என்ன?" },
        { label: "🎋 கரும்பு பராமரிப்பு", text: "கரும்பு பயிருக்கு நீர் மேலாண்மை எப்படி செய்வது?" },
        { label: "🌾 நெல் சாகுபடி", text: "நெல் பயிருக்கான நீர் பரிந்துரை என்ன?" },
        { label: "❓ இணையதள உதவி", text: "இந்த தளத்தை எவ்வாறு பயன்படுத்துவது?" }
      ]
    }
  };

  function bindEvents() {
    const toggleBtn = document.getElementById("agrobotToggleBtn");
    const windowEl = document.getElementById("agrobotWindow");
    const closeBtn = document.getElementById("agrobotCloseBtn");
    const form = document.getElementById("agrobotForm");
    const input = document.getElementById("agrobotInput");
    const micBtn = document.getElementById("agrobotMicBtn");
    const voiceToggle = document.getElementById("agrobotVoiceToggle");
    const stopSpeechBtn = document.getElementById("agrobotStopSpeechBtn");
    const langBtns = document.querySelectorAll(".agrobot-lang-switch .lang-btn");

    // Toggle Chat Window
    toggleBtn.addEventListener("click", () => {
      windowEl.classList.toggle("open");
      if (windowEl.classList.contains("open")) {
        input.focus();
      }
    });

    closeBtn.addEventListener("click", () => {
      windowEl.classList.remove("open");
      stopSpeaking();
    });

    // Language Toggle
    langBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        langBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentLang = btn.getAttribute("data-lang");
        localStorage.setItem("agrobot_lang", currentLang);
        updateLanguageUI();
      });
    });

    // Voice Output Toggle
    voiceToggle.addEventListener("click", () => {
      voiceEnabled = !voiceEnabled;
      localStorage.setItem("agrobot_voice", voiceEnabled);
      voiceToggle.classList.toggle("active", voiceEnabled);
      voiceToggle.querySelector("i").className = voiceEnabled ? "fa-solid fa-volume-high" : "fa-solid fa-volume-xmark";
      if (!voiceEnabled) stopSpeaking();
      showToast(voiceEnabled ? (currentLang === 'ta' ? "குரல் ஒலி இயக்கப்பட்டது 🔊" : "Voice output enabled 🔊") : (currentLang === 'ta' ? "குரல் ஒலி முடக்கப்பட்டது 🔇" : "Voice output muted 🔇"), "info");
    });

    // Stop Speech Button
    stopSpeechBtn.addEventListener("click", stopSpeaking);

    // Form Submit
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      await handleUserMessage(text);
    });

    // Microphone Speech Recognition
    if (recognition) {
      recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add("listening");
        input.placeholder = translations[currentLang].listening;
      };

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          input.value = transcript;
          handleUserMessage(transcript);
        }
      };

      recognition.onerror = (e) => {
        console.warn("Speech recognition error:", e.error);
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      micBtn.addEventListener("click", () => {
        if (isListening) {
          recognition.stop();
          stopListening();
        } else {
          stopSpeaking();
          recognition.lang = currentLang === "ta" ? "ta-IN" : "en-IN";
          try {
            recognition.start();
          } catch (err) {
            console.warn(err);
          }
        }
      });
    } else {
      micBtn.style.opacity = "0.4";
      micBtn.title = "Voice recognition not supported on this browser (Chrome / Edge recommended)";
    }
  }

  function stopListening() {
    isListening = false;
    const micBtn = document.getElementById("agrobotMicBtn");
    const input = document.getElementById("agrobotInput");
    if (micBtn) micBtn.classList.remove("listening");
    if (input) input.placeholder = translations[currentLang].placeholder;
  }

  function updateLanguageUI() {
    const t = translations[currentLang];
    document.getElementById("agrobotHeaderTitle").textContent = t.title;
    document.getElementById("agrobotHeaderSubtitle").innerHTML = t.subtitle;
    document.getElementById("agrobotInput").placeholder = t.placeholder;
    renderChips();
    
    // Clear and show translated greeting
    const msgContainer = document.getElementById("agrobotMessages");
    msgContainer.innerHTML = "";
    sendGreeting();
  }

  function renderChips() {
    const chipsContainer = document.getElementById("agrobotChips");
    if (!chipsContainer) return;
    const chips = translations[currentLang].chips;
    chipsContainer.innerHTML = chips.map(c => `<button type="button" class="agrobot-chip" data-text="${c.text}">${c.label}</button>`).join("");

    chipsContainer.querySelectorAll(".agrobot-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const text = chip.getAttribute("data-text");
        handleUserMessage(text);
      });
    });
  }

  function sendGreeting() {
    const msgContainer = document.getElementById("agrobotMessages");
    if (msgContainer.children.length > 0) return;
    appendMessage("bot", translations[currentLang].welcome);
  }

  async function handleUserMessage(text) {
    stopSpeaking();
    appendMessage("user", text);

    const sendBtn = document.getElementById("agrobotSendBtn");
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

    // Typing bubble
    const typingId = appendTypingBubble();

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, language: currentLang })
      });

      removeTypingBubble(typingId);

      const reply = res.reply || "Sorry, I could not process that request.";
      appendMessage("bot", reply);

      if (voiceEnabled && res.speech_text) {
        speakText(res.speech_text, res.language || currentLang);
      }
    } catch (err) {
      removeTypingBubble(typingId);
      appendMessage("bot", currentLang === "ta" ? "மன்னிக்கவும், தகவலைப் பெறுவதில் பிழை ஏற்பட்டது: " + err.message : "Sorry, an error occurred: " + err.message);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
  }

  function appendMessage(sender, text) {
    const msgContainer = document.getElementById("agrobotMessages");
    const msgDiv = document.createElement("div");
    msgDiv.className = `agrobot-msg ${sender}`;

    const formatted = formatMarkdown(text);
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    msgDiv.innerHTML = `
      <div class="agrobot-msg-content">${formatted}</div>
      <div class="agrobot-msg-time">${time}</div>
    `;

    msgContainer.appendChild(msgDiv);
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  function appendTypingBubble() {
    const msgContainer = document.getElementById("agrobotMessages");
    const id = "typing_" + Date.now();
    const div = document.createElement("div");
    div.id = id;
    div.className = "agrobot-msg bot typing";
    div.innerHTML = `<div class="agrobot-msg-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
    return id;
  }

  function removeTypingBubble(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n• /g, "<br>&bull; ")
      .replace(/\n1\. /g, "<br>1. ")
      .replace(/\n2\. /g, "<br>2. ")
      .replace(/\n3\. /g, "<br>3. ")
      .replace(/\n4\. /g, "<br>4. ")
      .replace(/\n5\. /g, "<br>5. ")
      .replace(/\n/g, "<br>");
  }

  // Speaks aloud using Server Audio Stream (/api/tts) or Web Speech API
  function speakText(text, lang) {
    stopSpeaking();
    if (!voiceEnabled) return;

    const isTamil = lang === "ta" || /[\u0B80-\u0BFF]/.test(text);
    const speakingBar = document.getElementById("agrobotSpeakingBar");
    const speakingText = document.getElementById("agrobotSpeakingText");

    if (speakingBar) {
      speakingText.textContent = isTamil ? "AgroBot பேசுகிறது..." : "AgroBot is speaking...";
      speakingBar.style.display = "flex";
    }

    // Clean text for natural speech pronunciation
    let cleanText = text
      .replace(/[*#•_`\\[\\]()]/g, " ")
      .replace(/%/g, isTamil ? " சதவீதம் " : " percent ")
      .replace(/°C/g, isTamil ? " டிகிரி செல்சியஸ் " : " degrees celsius ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length > 200) {
      cleanText = cleanText.substring(0, 200);
    }

    // Priority 1: High-Clarity Audio Stream from Server Endpoint (/api/tts)
    const ttsUrl = `${API_BASE}/api/tts?lang=${isTamil ? 'ta' : 'en'}&text=${encodeURIComponent(cleanText)}`;
    currentAudio = new Audio(ttsUrl);

    currentAudio.onended = () => {
      if (speakingBar) speakingBar.style.display = "none";
      currentAudio = null;
    };

    currentAudio.onerror = () => {
      // Priority 2: Fallback to Browser Speech Synthesis
      fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
    };

    currentAudio.play().catch(err => {
      console.warn("Audio element blocked, attempting browser speech synthesis:", err);
      fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
    });
  }

  function fallbackToBrowserSynth(cleanText, targetLang) {
    if (!synth) return;
    synth.cancel();
    if (synth.paused) synth.resume();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = targetLang;
    utterance.rate = targetLang.startsWith("ta") ? 0.9 : 1.0;
    utterance.pitch = 1.0;

    const speakingBar = document.getElementById("agrobotSpeakingBar");

    utterance.onend = () => { if (speakingBar) speakingBar.style.display = "none"; };
    utterance.onerror = () => { if (speakingBar) speakingBar.style.display = "none"; };

    synth.speak(utterance);
  }

  function stopSpeaking() {
    if (synth) {
      synth.cancel();
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    const speakingBar = document.getElementById("agrobotSpeakingBar");
    if (speakingBar) speakingBar.style.display = "none";
  }

  // Auto-init on page load if authenticated
  document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("token")) {
      injectWidget();
    }
  });

})();
