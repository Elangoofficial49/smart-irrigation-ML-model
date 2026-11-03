/**
 * AgroPulse Field Guide ("விவசாய வழிகாட்டி")
 * Bilingual Tamil and English agronomic reference and offline NLP engine.
 */

(function () {
  let currentLang = localStorage.getItem("agrobot_lang") || "ta";
  let voiceEnabled = localStorage.getItem("agrobot_voice") !== "false";
  let isListening = false;
  let recognition = null;
  let synth = window.speechSynthesis;
  let currentAudio = null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
  }

  function injectWidget() {
    if (document.getElementById("agrobotWidget")) return;

    const widgetDiv = document.createElement("div");
    widgetDiv.id = "agrobotWidget";
    widgetDiv.innerHTML = `
      <!-- Floating Trigger Button (No AI Badge) -->
      <button id="agrobotToggleBtn" class="agrobot-trigger" title="Field Guide | விவசாய வழிகாட்டி" aria-label="Open Agronomic Field Guide">
        <div class="agrobot-trigger-avatar">
          <i class="fa-solid fa-comments" aria-hidden="true"></i>
        </div>
      </button>

      <!-- Chat Window -->
      <div id="agrobotWindow" class="agrobot-window">
        <div class="agrobot-header">
          <div class="agrobot-header-info">
            <div class="agrobot-status-indicator"></div>
            <div>
              <div class="agrobot-title" id="agrobotHeaderTitle">${translations[currentLang].title}</div>
              <div class="agrobot-subtitle" id="agrobotHeaderSubtitle">${translations[currentLang].subtitle}</div>
            </div>
          </div>
          <div class="agrobot-header-actions">
            <div class="agrobot-lang-switch">
              <button type="button" class="lang-btn ${currentLang === 'ta' ? 'active' : ''}" data-lang="ta" title="தமிழ்">தமிழ்</button>
              <button type="button" class="lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" title="English">EN</button>
            </div>
            <button type="button" id="agrobotVoiceToggle" class="agrobot-icon-btn ${voiceEnabled ? 'active' : ''}" title="Toggle Voice Output">
              <i class="fa-solid ${voiceEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}" aria-hidden="true"></i>
            </button>
            <button type="button" id="agrobotCloseBtn" class="agrobot-icon-btn" title="Close">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <div id="agrobotSpeakingBar" class="agrobot-speaking-bar" style="display:none;">
          <div class="sound-wave">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <span id="agrobotSpeakingText">Speaking...</span>
          <button type="button" id="agrobotStopSpeechBtn" class="btn-stop-speech" title="Stop Voice"><i class="fa-solid fa-stop" aria-hidden="true"></i></button>
        </div>

        <div id="agrobotMessages" class="agrobot-messages"></div>

        <div id="agrobotChips" class="agrobot-chips"></div>

        <form id="agrobotForm" class="agrobot-input-area">
          <button type="button" id="agrobotMicBtn" class="agrobot-mic-btn" title="Voice Input">
            <i class="fa-solid fa-microphone" aria-hidden="true"></i>
          </button>
          <input type="text" id="agrobotInput" class="agrobot-input" placeholder="${translations[currentLang].placeholder}" autocomplete="off">
          <button type="submit" id="agrobotSendBtn" class="agrobot-send-btn" title="Send message">
            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
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
    ta: {
      title: "விவசாய வழிகாட்டி",
      subtitle: "தமிழ் &bull; ஆஃப்லைன் உழவர் உதவி",
      placeholder: "மண் ஈரப்பதம், நீர்ப்பாசனம் அல்லது பயிர் பற்றி கேளுங்கள்...",
      speaking: "குரல் வழிகாட்டி இயங்குகிறது...",
      listening: "கேட்கிறது... இப்போது பேசுங்கள்",
      welcome: "வணக்கம். நான் உங்கள் **விவசாய வழிகாட்டி**. மண் ஈரப்பதம், நீர்ப்பாசனம் மற்றும் பயிர் மேலாண்மை குறித்த விவரங்களை இங்கே கேட்கலாம்.",
      chips: [
        { label: "தண்ணீர் பாய்ச்சலாமா?", text: "இப்போது தண்ணீர் பாய்ச்சலாமா?" },
        { label: "மண் ஈரப்பதம்", text: "மண் ஈரப்பதம் எவ்வளவு இருக்கிறது?" },
        { label: "உர மேலாண்மை", text: "உர மேலாண்மை எவ்வாறு செய்வது?" },
        { label: "கரும்பு பராமரிப்பு", text: "கரும்பு பயிருக்கு நீர் மேலாண்மை எப்படி செய்வது?" },
        { label: "நெல் சாகுபடி", text: "நெல் பயிருக்கான நீர் பரிந்துரை என்ன?" },
        { label: "பூச்சி கட்டுப்பாடு", text: "இயற்கை முறையில் பூச்சிகளை கட்டுப்படுத்துவது எப்படி?" }
      ]
    },
    en: {
      title: "AgroPulse Field Guide",
      subtitle: "Agronomic Reference &bull; Offline Ready",
      placeholder: "Ask about soil moisture, irrigation schedules, or crops...",
      speaking: "Reading response aloud...",
      listening: "Listening... Speak now",
      welcome: "Welcome to the **AgroPulse Field Guide**. Ask about current soil moisture readings, pump schedules, or crop water requirements.",
      chips: [
        { label: "Irrigate Now?", text: "Should I turn on irrigation now?" },
        { label: "Soil Moisture", text: "What is the current soil moisture reading?" },
        { label: "Fertilizers", text: "How to manage crop fertilizers and NPK?" },
        { label: "Sugarcane Care", text: "How to manage sugarcane irrigation?" },
        { label: "Paddy Care", text: "What is the best irrigation for paddy?" },
        { label: "Pest Control", text: "How to control farm pests naturally?" }
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

    function toggleDrawer() {
      windowEl.classList.toggle("open");
      if (windowEl.classList.contains("open")) {
        input.focus();
      }
    }

    window.toggleAgroBot = toggleDrawer;
    toggleBtn.addEventListener("click", toggleDrawer);

    closeBtn.addEventListener("click", () => {
      windowEl.classList.remove("open");
      stopSpeaking();
    });

    langBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        langBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentLang = btn.getAttribute("data-lang");
        localStorage.setItem("agrobot_lang", currentLang);
        updateLanguageUI();
      });
    });

    voiceToggle.addEventListener("click", () => {
      voiceEnabled = !voiceEnabled;
      localStorage.setItem("agrobot_voice", voiceEnabled);
      voiceToggle.classList.toggle("active", voiceEnabled);
      voiceToggle.querySelector("i").className = voiceEnabled ? "fa-solid fa-volume-high" : "fa-solid fa-volume-xmark";
      if (!voiceEnabled) stopSpeaking();
      showToast(voiceEnabled ? (currentLang === 'ta' ? "குரல் ஒலி இயக்கப்பட்டது" : "Voice output enabled") : (currentLang === 'ta' ? "குரல் ஒலி முடக்கப்பட்டது" : "Voice output muted"), "info");
    });

    stopSpeechBtn.addEventListener("click", stopSpeaking);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      await handleUserMessage(text);
    });

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

      recognition.onerror = () => {
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
          } catch (err) {}
        }
      });
    } else {
      micBtn.style.opacity = "0.4";
      micBtn.title = "Voice recognition requires Chrome or Edge";
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

    const typingId = appendTypingBubble();

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, language: currentLang })
      });

      removeTypingBubble(typingId);

      const reply = res.reply || "Request could not be processed.";
      appendMessage("bot", reply);

      if (voiceEnabled && res.speech_text) {
        speakText(res.speech_text, res.language || currentLang);
      }
    } catch (err) {
      removeTypingBubble(typingId);
      const offlineRes = processOfflineTamilNlp(text, currentLang);
      const offlineBadge = `<div style="margin-top:6px; font-size:11px; color:var(--action-green);"><i class="fa-solid fa-bolt"></i> ${currentLang === 'ta' ? 'ஆஃப்லைன் பயன்முறை' : 'Offline Reference Mode'}</div>`;
      appendMessage("bot", offlineRes.reply + offlineBadge);

      if (voiceEnabled && offlineRes.speech_text) {
        fallbackToBrowserSynth(offlineRes.speech_text, currentLang === 'ta' ? 'ta-IN' : 'en-IN');
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
  }

  function processOfflineTamilNlp(query, lang) {
    const q = query.toLowerCase().trim();
    const isTa = lang === "ta" || /[\u0B80-\u0BFF]/.test(query);

    const cachedMoisture = localStorage.getItem("last_soil_moisture") || "48.5";
    const cachedTemp = localStorage.getItem("last_temp") || "30.0";
    const cachedPump = localStorage.getItem("last_pump_status") || "OFF";

    if (isTa) {
      if (containsAny(q, "ஆன் பண்ணு", "ஆன் செய்", "மோட்டார் போடு", "பம்பை ஆன்", "ஆன் பண்ண முடியுமா", "turn on")) {
        return {
          reply: `**மோட்டாரை இயக்க:** **Irrigation Control** பக்கத்தில் உள்ள **'Turn ON Pump'** பொத்தானை அழுத்தவும்.\nதற்போதைய மண் ஈரப்பதம்: **${cachedMoisture}%**.`,
          speech_text: `மோட்டாரை இயக்க நீர்ப்பாசன பக்கத்தில் Turn ON Pump பட்டனை அழுத்தவும். மண் ஈரப்பதம் ${cachedMoisture} சதவீதம்.`
        };
      }
      if (containsAny(q, "ஆப் பண்ணு", "ஆப் செய்", "நிறுத்து", "turn off")) {
        return {
          reply: `**மோட்டாரை நிறுத்த:** **Irrigation Control** பக்கத்தில் உள்ள **'Turn OFF Pump'** பொத்தானை அழுத்தவும்.`,
          speech_text: `மோட்டாரை நிறுத்த நீர்ப்பாசன பக்கத்தில் Turn OFF Pump பட்டனை அழுத்தவும்.`
        };
      }
      if (containsAny(q, "தண்ணீர் பாய்ச்சலாமா", "தண்ணி பாய்ச்ச", "நீர் மேலாண்மை", "irrigate")) {
        const m = parseFloat(cachedMoisture);
        if (m < 35) {
          return {
            reply: `**நீர்ப்பாசன பரிந்துரை:** வயலின் மண் ஈரப்பதம் குறைவாக உள்ளது (**${cachedMoisture}%**). இப்போது மோட்டாரை இயக்கி தண்ணீர் பாய்ச்சவும்.`,
            speech_text: `உங்கள் வயலின் மண் ஈரப்பதம் குறைவாக உள்ளது ${cachedMoisture} சதவீதம். இப்போது தண்ணீர் பாய்ச்ச பரிந்துரைக்கப்படுகிறது.`
          };
        } else {
          return {
            reply: `**மண் ஈரப்பதம் போதுமானது:** தற்போதைய மண் ஈரப்பதம் **${cachedMoisture}%**. தற்போது நீர் பாய்ச்ச தேவையில்லை.`,
            speech_text: `மண் ஈரப்பதம் போதுமான அளவில் உள்ளது ${cachedMoisture} சதவீதம். தற்போது தண்ணீர் பாய்ச்ச தேவையில்லை.`
          };
        }
      }
      if (containsAny(q, "மண் ஈரம்", "ஈரப்பதம்", "சென்சார்", "sensor", "moisture")) {
        return {
          reply: `**சென்சார் விவரங்கள்:**\n• மண் ஈரப்பதம்: **${cachedMoisture}%**\n• வெப்பநிலை: **${cachedTemp}°C**\n• மோட்டார் நிலை: **${cachedPump}**`,
          speech_text: `மண் ஈரப்பதம் ${cachedMoisture} சதவீதம். வெப்பநிலை ${cachedTemp} டிகிரி செல்சியஸ். மோட்டார் நிலை ${cachedPump}.`
        };
      }
      if (containsAny(q, "உரம்", "யூரியா", "டிஏபி", "பொட்டாஷ்", "பஞ்சகாவ்யா", "fertilizer")) {
        return {
          reply: `**உர மேலாண்மை வழிகாட்டல்:**\n• **அடிப்படை உரம்:** தொழு உரம் அல்லது மண்புழு உரம் இடவும்.\n• **NPK உரம்:** சொட்டுநீர் உரப்பாசனம் மூலம் நீரில் கரையும் உரங்களை இடுவது 40% உரத்தை சேமிக்கும்.\n• **இயற்கை உரம்:** 3% பஞ்சகாவ்யா தெளிக்கவும்.`,
          speech_text: `தொழு உரம் அல்லது மண்புழு உரம் இட்டு சொட்டுநீர் உரப்பாசனம் மூலம் நீரில் கரையும் உரங்களை இடவும்.`
        };
      }
      if (containsAny(q, "பூச்சி", "புழு", "நோய்", "pest", "disease")) {
        return {
          reply: `**இயற்கை பூச்சி மேலாண்மை:**\n• 3% வேப்பெண்ணெய் கரைசல் தெளிப்பது சாறு உறிஞ்சும் பூச்சிகளைக் கட்டுப்படுத்தும்.\n• மஞ்சள் மற்றும் நீல நிற ஒட்டும் பொறிகளை வயலில் வைக்கவும்.`,
          speech_text: `மூன்று சதவீதம் வேப்பெண்ணெய் கரைசல் தெளிப்பது சாறு உறிஞ்சும் பூச்சிகளைக் கட்டுப்படுத்தும்.`
        };
      }
      if (containsAny(q, "கரும்பு", "sugarcane")) {
        return {
          reply: `**கரும்பு பயிர் வழிகாட்டி:**\n• முளைப்பு பருவத்தில் 7 நாட்களுக்கு ஒருமுறை நீர் பாய்ச்சவும்.\n• மண் ஈரப்பதம் 50% முதல் 60% இருக்குமாறு சொட்டுநீர்ப்பாசனம் அமைப்பது 45% நீரைச் சேமிக்கும்.`,
          speech_text: `கரும்பு பயிருக்கு மண் ஈரப்பதம் ஐம்பது முதல் அறுபது சதவீதம் இருக்குமாறு சொட்டுநீர்ப்பாசனம் அமைக்கவும்.`
        };
      }
      if (containsAny(q, "நெல்", "paddy", "rice")) {
        return {
          reply: `**நெல் பயிர் வழிகாட்டி:**\n• தூர் கட்டும் பருவத்தில் மாறி மாறி நனைத்து உலர்த்தும் (AWD) முறையைப் பயன்படுத்தி நீரைச் சேமிக்கவும்.`,
          speech_text: `நெல் பயிருக்கு மாறி மாறி நனைத்து உலர்த்தும் முறையைப் பயன்படுத்தி நீரைச் சேமிக்கவும்.`
        };
      }
      return {
        reply: `**ஆஃப்லைன் உழவர் வழிகாட்டி:**\n• மண் ஈரப்பதம்: **${cachedMoisture}%**\n• மோட்டார் நிலை: **${cachedPump}**\nநீர்ப்பாசனம், உரம், பூச்சி மேலாண்மை அல்லது பயிர் பராமரிப்பு பற்றி கேளுங்கள்.`,
        speech_text: `ஆஃப்லைன் முறை செயல்படுகிறது. மண் ஈரப்பதம் ${cachedMoisture} சதவீதம்.`
      };
    } else {
      return {
        reply: `**AgroPulse Offline Reference:**\n• Soil Moisture: **${cachedMoisture}%**\n• Temperature: **${cachedTemp}°C**\n• Pump State: **${cachedPump}**\nAsk about irrigation thresholds, fertilizer application, pest control, or crop schedules.`,
        speech_text: `Offline reference mode. Current soil moisture is ${cachedMoisture} percent.`
      };
    }
  }

  function containsAny(text, ...keywords) {
    for (let k of keywords) {
      if (text.includes(k)) return true;
    }
    return false;
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
    div.innerHTML = `<div class="agrobot-msg-content">Processing...</div>`;
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
      .replace(/[\u2014\u2013]/g, "-")
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

  function speakText(text, lang) {
    stopSpeaking();
    if (!voiceEnabled) return;

    const isTamil = lang === "ta" || /[\u0B80-\u0BFF]/.test(text);
    const speakingBar = document.getElementById("agrobotSpeakingBar");
    const speakingText = document.getElementById("agrobotSpeakingText");

    if (speakingBar) {
      speakingText.textContent = isTamil ? "குரல் வழிகாட்டி..." : "Reading aloud...";
      speakingBar.style.display = "flex";
    }

    let cleanText = text
      .replace(/[*#•_`\\[\\]()]/g, " ")
      .replace(/%/g, isTamil ? " சதவீதம் " : " percent ")
      .replace(/°C/g, isTamil ? " டிகிரி செல்சியஸ் " : " degrees celsius ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length > 200) {
      cleanText = cleanText.substring(0, 200);
    }

    if (navigator.onLine) {
      const ttsUrl = `${API_BASE}/api/tts?lang=${isTamil ? 'ta' : 'en'}&text=${encodeURIComponent(cleanText)}`;
      currentAudio = new Audio(ttsUrl);

      currentAudio.onended = () => {
        if (speakingBar) speakingBar.style.display = "none";
        currentAudio = null;
      };

      currentAudio.onerror = () => {
        fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
      };

      currentAudio.play().catch(() => {
        fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
      });
    } else {
      fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
    }
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

  document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("token")) {
      injectWidget();
    }
  });

})();
