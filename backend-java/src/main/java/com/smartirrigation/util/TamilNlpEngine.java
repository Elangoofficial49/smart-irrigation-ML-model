package com.smartirrigation.util;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * High-Precision Tamil Natural Language Processing (NLP) Engine for Precision Agriculture.
 * Performs morphological normalization, intent classification, agricultural entity extraction,
 * and contextual response synthesis for farmers.
 */
public class TamilNlpEngine {

    public enum Intent {
        IRRIGATION_DECISION,
        PUMP_TURN_ON,
        PUMP_TURN_OFF,
        SOIL_TELEMETRY,
        WEATHER_FORECAST,
        FERTILIZER_GUIDE,
        PEST_CONTROL,
        CROP_SUGARCANE,
        CROP_PADDY,
        CROP_COTTON,
        CROP_TOMATO,
        CROP_GENERAL,
        GRATITUDE,
        GREETINGS,
        HOW_ARE_YOU,
        FAREWELL,
        HELP_NAVIGATION,
        GENERAL_AGRICULTURE
    }

    public static class NlpResult {
        public final Intent intent;
        public final double confidence;
        public final String response;
        public final String speechText;
        public final String targetAction; // e.g. "PUMP_ON", "PUMP_OFF"

        public NlpResult(Intent intent, double confidence, String response, String speechText, String targetAction) {
            this.intent = intent;
            this.confidence = confidence;
            this.response = response;
            this.speechText = speechText;
            this.targetAction = targetAction;
        }
    }

    public static class FarmTelemetry {
        public double soilMoisture = 45.0;
        public double temperature = 30.0;
        public double humidity = 55.0;
        public double rainProbability = 10.0;
        public String pumpStatus = "OFF";
        public List<String> registeredCrops = new ArrayList<>();
    }

    /**
     * Analyzes Tamil & multilingual user queries and synthesizes an intelligent agricultural answer.
     */
    public static NlpResult process(String rawQuery, FarmTelemetry farm) {
        if (rawQuery == null || rawQuery.trim().isEmpty()) {
            return new NlpResult(Intent.GREETINGS, 1.0, 
                    "வணக்கம்! 🙏 நான் AgroBot விவசாய AI வழிகாட்டி. உங்கள் பயிர் மற்றும் நீர்ப்பாசனத்திற்கு நான் எவ்வாறு உதவ வேண்டும்?",
                    "வணக்கம்! நான் உங்கள் அக்ரோபாட் விவசாய வழிகாட்டி. உங்களுக்கு என்ன உதவி வேண்டும்?", null);
        }

        String normalized = normalizeTamil(rawQuery);
        Intent intent = classifyIntent(normalized);
        String targetAction = null;
        String reply;

        long moistureRound = Math.round(farm.soilMoisture);
        long tempRound = Math.round(farm.temperature);
        long rainRound = Math.round(farm.rainProbability);

        switch (intent) {
            case PUMP_TURN_ON -> {
                targetAction = "PUMP_ON";
                reply = """
                        ⚡ **ஆம், நிச்சயமாக!** நான் இப்போது உங்கள் மோட்டாரை **ON (இயக்கம்)** செய்துவிட்டேன்.
                        
                        📊 **தற்போதைய பண்ணை நிலை:**
                        • **மண் ஈரப்பதம்:** %d%%
                        • **மழை வாய்ப்பு:** %d%%
                        • **மோட்டார் நிலை:** **இயக்கத்தில் (ON)**
                        
                        💡 **கட்டுப்பாடு:** நீர்ப்பாசனத்தை எப்போது வேண்டுமானாலும் நிறுத்த **Irrigation Control** பக்கத்தில் உள்ள **Turn Pump OFF** பட்டனைப் பயன்படுத்தவும்.
                        """.formatted(moistureRound, rainRound);
            }
            case PUMP_TURN_OFF -> {
                targetAction = "PUMP_OFF";
                reply = """
                        🛑 **மோட்டார் வெற்றிகரமாக நிறுத்தப்பட்டது (Pump Turned OFF)!**
                        
                        தண்ணீர் பாய்ச்சல் நிறுத்தப்பட்டு வயல் தானியங்கி கண்காணிப்பு முறைக்கு மாற்றப்பட்டுள்ளது.
                        • தற்போதைய மண் ஈரம்: **%d%%**
                        """.formatted(moistureRound);
            }
            case IRRIGATION_DECISION -> {
                if (farm.soilMoisture < 32.0 && farm.rainProbability < 40.0) {
                    reply = """
                            💧 **நீர்ப்பாசன அவசரப் பரிந்துரை:**
                            உங்கள் வயலின் மண் ஈரப்பதம் குறைவாக உள்ளது (**%d%%**). மழை பெய்வதற்கான வாய்ப்பும் குறைவு (**%d%%**).
                            
                            🌱 **செயல்பாடு:** பயிர்கள் வாடுவதைத் தடுக்க **இப்போது மோட்டாரை இயக்கி தண்ணீர் பாய்ச்ச பரிந்துரைக்கப்படுகிறது**.
                            """.formatted(moistureRound, rainRound);
                } else if (farm.rainProbability >= 60.0) {
                    reply = """
                            🌧️ **மழை முன்னெச்சரிக்கை - நீர்ப்பாசனத்தை நிறுத்துக:**
                            அதிக மழை பெய்ய வாய்ப்புள்ளது (**%d%%**). நிலத்தில் அதிக நீர் தேங்கி வேரழுகல் ஏற்படுவதைத் தவிர்க்க இப்போது மோட்டாரை **இயக்க வேண்டாம்**.
                            """.formatted(rainRound);
                } else if (farm.soilMoisture >= 60.0) {
                    reply = """
                            ✅ **மண் ஈரப்பதம் சிறப்பான நிலையில் உள்ளது:**
                            உங்கள் நிலத்தின் ஈரப்பதம் போதுமான அளவில் உள்ளது (**%d%%**). தற்போது மோட்டார் ஆன் செய்ய தேவையில்லை.
                            """.formatted(moistureRound);
                } else {
                    reply = """
                            📊 **தற்போதைய நீர்ப்பாசன நிலை:**
                            • மண் ஈரப்பதம்: **%d%%**
                            • மோட்டார் நிலை: **%s**
                            • மழை வாய்ப்பு: **%d%%**
                            
                            கணினியின் தானியங்கி ML முடிவை அறிய **Irrigation** பக்கத்தில் **'Evaluate ML Decision'** கிளிக் செய்யவும்.
                            """.formatted(moistureRound, farm.pumpStatus, rainRound);
                }
            }
            case SOIL_TELEMETRY -> {
                String condition = farm.soilMoisture < 30 ? "⚠️ வறண்ட நிலை (நீர் தேவை)" : (farm.soilMoisture > 65 ? "💦 அதிக ஈரப்பதம்" : "✨ செழிப்பான ஈரப்பதம்");
                reply = """
                        🌱 **நேரலை சென்சார் விவரங்கள்:**
                        • 💧 **மண் ஈரப்பதம்:** %s%%
                        • 🌡️ **வெப்பநிலை:** %s °C
                        • 💨 **காற்றின் ஈரப்பதம்:** %s%%
                        • 🌧️ **மழை வாய்ப்பு:** %s%%
                        • 🌾 **நிலத்தின் தற்போதைய நிலை:** %s
                        """.formatted(farm.soilMoisture, farm.temperature, farm.humidity, farm.rainProbability, condition);
            }
            case WEATHER_FORECAST -> {
                reply = """
                        ⛅ **வானிலை & காலநிலை அறிக்கை:**
                        • தற்போதைய வெப்பநிலை: **%s°C**
                        • காற்றின் ஈரப்பதம்: **%s%%**
                        • மழை வாய்ப்பு: **%s%%**
                        
                        📍 உங்கள் துல்லியமான GPS இருப்பிடத்தின் முழு **7 நாள் வானிலை முன்னறிவிப்பு** மற்றும் செயற்கைக்கோள் மேகக் கூட்டத்தை அறிய **Weather** பக்கத்தைப் பார்க்கவும்.
                        """.formatted(farm.temperature, farm.humidity, farm.rainProbability);
            }
            case FERTILIZER_GUIDE -> {
                reply = """
                        🌿 **அறிவியல் உர மேலாண்மை வழிகாட்டல்:**
                        1. **அடிப்படை உரம்:** ஏக்கருக்கு 5 டன் தொழு உரம் அல்லது 2 டன் மண்புழு உரம் இடுவது மண் ஈரப்பதம் தாங்கும் திறனை அதிகரிக்கும்.
                        2. **NPK சமச்சீர் உரம்:** பயிரின் வளர்ச்சி பருவத்திற்கு ஏற்ப தழைச்சத்து (N), மணிச்சத்து (P), சாம்பல்சத்தை (K) சொட்டுநீர் உரப்பாசனம் (Fertigation) மூலம் வழங்குவது 40% உரச் சேமிப்பைத் தரும்.
                        3. **இயற்கை வளர்ச்சி ஊக்கி:** 3% பஞ்சகாவ்யா அல்லது மீன் அமினோ அமிலம் தெளிப்பது பயிர் நோய் எதிர்ப்புச் சக்தியை அதிகரிக்கும்.
                        """;
            }
            case PEST_CONTROL -> {
                reply = """
                        🐛 **ஒருங்கிணைந்த இயற்கை பூச்சி மேலாண்மை:**
                        1. **சாறு உறிஞ்சும் பூச்சிகள் (அசுவினி/இலைப்பேன்):** 3% வேப்பெண்ணெய் கரைசல் (10 லிட்டர் தண்ணீருக்கு 30 மி.லி) மற்றும் காதி சோப் கலந்து தெளிக்கவும்.
                        2. **குருத்துப்பூச்சி / புழுக்கள்:** பேசிலஸ் துரிஞ்சியென்சிஸ் (Bt) அல்லது 5 இலைக் கரைசல் தெளிக்கவும்.
                        3. **பொறிகள்:** ஏக்கருக்கு 5 மஞ்சள் மற்றும் நீல நிற ஒட்டும் பொறிகளை வைப்பது பூச்சிகளின் இனப்பெருக்கத்தைத் தடுக்கும்.
                        """;
            }
            case CROP_SUGARCANE -> {
                reply = """
                        🎋 **கரும்பு பயிர் சொட்டுநீர் & சாகுபடி வழிகாட்டி:**
                        • **முளைப்பு & தூர் கட்டும் பருவம் (0-120 நாட்கள்):** மண் ஈரப்பதம் 50-60% இருக்க வேண்டும். 7 நாட்களுக்கு ஒருமுறை நீர் பாய்ச்சவும்.
                        • **வளர்ச்சிப் பருவம்:** சொட்டுநீர் உரப்பாசனம் (Fertigation) முறையில் யூரியா மற்றும் பொட்டாஷ் உரம் பிரித்து இடவும்.
                        • **நீர் சேமிப்பு:** சொட்டுநீர்ப்பாசனம் அமைப்பது கரும்பில் 45% நீரைச் சேமித்து, சர்க்கரை அளவை (Recovery) 1.5% அதிகரிக்கும்.
                        """;
            }
            case CROP_PADDY -> {
                reply = """
                        🌾 **நெல் பயிர் நீர் மேலாண்மை (AWD முறை):**
                        • **நடவு முதல் 10 நாட்கள்:** 2-3 செ.மீ ஆழத்தில் மேலோட்டமாக நீர் நிறுத்தவும்.
                        • **தூர் கட்டும் பருவம்:** மாறி மாறி நனைத்து உலர்த்தும் (Alternate Wetting & Drying) முறையைப் பின்பற்றவும். நிலத்தில் 5 செ.மீ நீர் வடிந்த பின் மீண்டும் நீர் பாய்ச்சுவது 30% நீரை மிச்சப்படுத்தும்.
                        • **பால் பிடிக்கும் பருவம்:** சீரான ஈரப்பதம் நிலவ வேண்டும். அறுவடைக்கு 10 நாட்களுக்கு முன் நீரை முழுமையாக வடிக்கவும்.
                        """;
            }
            case CROP_COTTON -> {
                reply = """
                        🌿 **பருத்தி பயிர் நீர் & உரம் பரிந்துரை:**
                        • பருத்திக்கு அதிகப்படியான நீர் தேங்கக் கூடாது (வேரழுகல் உண்டாகும்).
                        • பூக்கும் மற்றும் காய் பிடிக்கும் பருவத்தில் வறட்சி ஏற்படாமல் மிதமான சொட்டுநீர் வழங்கவும்.
                        • பொட்டாசியம் நைட்ரேட் (13-0-45) 1% இலைவழியாகத் தெளிப்பது காய் வெடிப்பைத் தடுத்து பஞ்சின் தரத்தை உயர்த்தும்.
                        """;
            }
            case CROP_TOMATO -> {
                reply = """
                        🍅 **தக்காளி பயிர் வழிகாட்டி:**
                        • மிதமான மற்றும் சீரான ஈரப்பதம் தேவை. இலைகளில் தண்ணீர் படாமல் சொட்டுநீரில் நீர் பாய்ச்சுவது இலைக்கருகல் நோயைத் தடுக்கும்.
                        • மாலை நேரங்களில் நீர் பாய்ச்சுவது வேரின் உறிஞ்சும் திறனை அதிகரிக்கும்.
                        • கால்சியம் சத்து குறைபாட்டால் உண்டாகும் பழ அடி அழுகலைத் தடுக்க ஜிப்சம் அல்லது கால்சியம் நைட்ரேட் இடவும்.
                        """;
            }
            case CROP_GENERAL -> {
                String crops = farm.registeredCrops.isEmpty() ? "பயிர்கள் எதுவும் பதிவு செய்யப்படவில்லை" : String.join(", ", farm.registeredCrops);
                reply = """
                        🌾 **உங்கள் பண்ணைப் பயிர்கள்:** %s
                        
                        பயிர்களின் வயது மற்றும் பருவத்திற்கு ஏற்ப துல்லியமான நீர் மற்றும் உர ஆலோசனைகளைப் பெற **Crops** பக்கத்தைப் பார்க்கவும்.
                        """.formatted(crops);
            }
            case GRATITUDE -> {
                reply = "மகிழ்ச்சி! 🙏 மிக்க நன்றி. உங்கள் பயிர்கள், மண் ஈரப்பதம் அல்லது நீர்ப்பாசனம் குறித்து எப்போது வேண்டுமானாலும் என்னிடம் கேட்கலாம். உங்கள் விவசாயம் செழிக்க வாழ்த்துகள்!";
            }
            case GREETINGS -> {
                reply = """
                        வணக்கம்! 🙏 நான் **AgroBot**, உங்கள் பண்ணையின் துல்லிய AI விவசாய வழிகாட்டி.
                        
                        தற்போது உங்கள் பண்ணை நிலவரம்:
                        • மண் ஈரப்பதம்: **%d%%**
                        • வெப்பநிலை: **%d°C**
                        • மோட்டார் நிலை: **%s**
                        
                        நீர்ப்பாசனம், உரம், பயிர் பாதுகாப்பு அல்லது வானிலை பற்றி என்னிடம் கேளுங்கள்!
                        """.formatted(moistureRound, tempRound, farm.pumpStatus);
            }
            case HOW_ARE_YOU -> {
                reply = """
                        நான் நலமாக இருக்கிறேன்! 🙏 உங்கள் பண்ணையின் சென்சார்கள் அனைத்தும் துல்லியமாக செயல்பட்டு வருகின்றன (மண் ஈரப்பதம்: **%d%%**). 
                        
                        இன்று உங்கள் பயிருக்கு என்ன ஆலோசனை வேண்டும்?
                        """.formatted(moistureRound);
            }
            case FAREWELL -> {
                reply = """
                        சரிங்க! 👍 நாளை காலை தாராளமாக வாருங்கள்.
                        
                        நான் உங்கள் வயலின் மண் ஈரப்பதம் மற்றும் மோட்டார் செயல்பாடுகளைத் தொடர்ந்து கண்காணித்து வருகிறேன். உங்கள் விவசாயம் சிறக்கட்டும்! நாளை சந்திப்போம்! 👋
                        """;
            }
            case HELP_NAVIGATION -> {
                reply = """
                        💡 **இணையதள வழிகாட்டி (Platform Guide):**
                        1. 📊 **Dashboard:** ஒட்டுமொத்த பண்ணை நிலை, நேரலை IoT சென்சார் வரைபடங்கள்.
                        2. 📡 **Sensors:** வரலாற்று அளவீடுகள் மற்றும் CSV தரவிறக்கம்.
                        3. 💧 **Irrigation:** தானியங்கி ML கணிப்பு மற்றும் நேரடி மோட்டார் கட்டுப்பாடு.
                        4. 🌾 **Crops:** புதிய பயிர்களைச் சேர்த்து சாகுபடி கண்காணிப்பு.
                        5. ⛅ **Weather:** உங்கள் நேரடி GPS இருப்பிடத்திற்கான 7 நாள் வானிலை அறிக்கை.
                        """;
            }
            default -> {
                reply = """
                        நான் உங்கள் பண்ணையின் நிலையை ஆய்வு செய்தேன்.
                        • மண் ஈரப்பதம்: **%d%%**
                        • மோட்டார் நிலை: **%s**
                        • மழை வாய்ப்பு: **%d%%**
                        
                        மோட்டாரை இயக்க வேண்டுமா, உரப் பரிந்துரை தேவையா, அல்லது வானிலை விவரம் அறிய வேண்டுமா? என்னிடம் கேளுங்கள்!
                        """.formatted(moistureRound, farm.pumpStatus, rainRound);
            }
        }

        String speechText = cleanForSpeech(reply);
        return new NlpResult(intent, 0.95, reply, speechText, targetAction);
    }

    /**
     * Normalizes Tamil speech patterns, colloquial variants, and whitespace.
     */
    public static String normalizeTamil(String input) {
        String s = input.toLowerCase(Locale.ROOT).trim();
        // Normalize colloquial spoken forms to standard agronomic roots
        s = s.replace("பாக்கணும்", "பார்க்க வேண்டும்")
             .replace("பாக்கனும்", "பார்க்க வேண்டும்")
             .replace("பாய்ச்சனும்", "பாய்ச்ச வேண்டும்")
             .replace("பாய்ச்சணும்", "பாய்ச்ச வேண்டும்")
             .replace("போடலாமா", "இடலாமா")
             .replace("ஓடல", "இயங்கவில்லை")
             .replace("ஓடலை", "இயங்கவில்லை")
             .replace("போடணும்", "போட வேண்டும்")
             .replace("பண்ணனும்", "செய்ய வேண்டும்")
             .replace("பண்ணு", "செய்")
             .replace("காலைல", "காலையில்")
             .replace("நாளைக்கு", "நாளை")
             .replace("தண்ணி", "தண்ணீர்")
             .replace("மோட்டர்", "மோட்டார்");
        return s;
    }

    /**
     * Deep Tamil Semantic & Keyword Intent Classifier.
     */
    private static Intent classifyIntent(String text) {
        // 1. Pump Turn ON Action
        if (containsAny(text, "ஆன் பண்ணு", "ஆன் செய்", "மோட்டார் போடு", "மோட்டாரை போடு", "பம்பை ஆன்", "பம்பு ஆன்", 
                "ஆன் செய்ய முடியுமா", "ஆன் பண்ண முடியுமா", "turn on pump", "start pump", "turn it on", "start motor")) {
            return Intent.PUMP_TURN_ON;
        }

        // 2. Pump Turn OFF Action
        if (containsAny(text, "ஆப் பண்ணு", "ஆப் செய்", "மோட்டாரை நிறுத்து", "பம்பை ஆப்", "பம்பை நிறுத்து", 
                "தண்ணீரை நிறுத்து", "turn off pump", "stop pump", "switch off motor", "stop motor")) {
            return Intent.PUMP_TURN_OFF;
        }

        // 3. Irrigation Decision / Query
        if (containsAny(text, "தண்ணீர் பாய்ச்சலாமா", "தண்ணீர் பாய்ச்ச", "தண்ணீர் தேவை", "பாசனம் செய்யலாமா", 
                "நீர் மேலாண்மை", "நீர் தேவையா", "மோட்டார் போடலாமா", "irrigate now", "should i irrigate", "watering", "irrigation")) {
            return Intent.IRRIGATION_DECISION;
        }

        // 4. Soil Moisture / Sensors
        if (containsAny(text, "மண் ஈரம்", "ஈரப்பதம்", "சென்சார்", "மண் ஈரப்பதம்", "வெப்பநிலை", 
                "காற்றின் ஈரம்", "soil moisture", "sensor reading", "temperature", "humidity")) {
            return Intent.SOIL_TELEMETRY;
        }

        // 5. Weather / Rain
        if (containsAny(text, "வானிலை", "மழை", "காலநிலை", "மழை வருமா", "வெயில்", "மேகம்", 
                "weather", "rain", "forecast", "climate", "rainfall")) {
            return Intent.WEATHER_FORECAST;
        }

        // 6. Fertilizers / Nutrients
        if (containsAny(text, "உரம்", "யூரியா", "டிஏபி", "பொட்டாஷ்", "பஞ்சகாவ்யா", "மண்புழு உரம்", 
                "உரப்பாசனம்", "fertilizer", "urea", "dap", "potash", "npk", "manure", "fertigation")) {
            return Intent.FERTILIZER_GUIDE;
        }

        // 7. Pests & Diseases
        if (containsAny(text, "பூச்சி", "புழு", "நோய்", "வேரழுகல்", "இலை சுருட்டை", "பூச்சிக்கொல்லி", 
                "வேப்பெண்ணெய்", "தாக்குதல்", "pest", "disease", "insect", "spray", "fungus")) {
            return Intent.PEST_CONTROL;
        }

        // 8. Crops (Specific)
        if (containsAny(text, "கரும்பு", "sugarcane")) return Intent.CROP_SUGARCANE;
        if (containsAny(text, "நெல்", "அரிசி", "paddy", "rice")) return Intent.CROP_PADDY;
        if (containsAny(text, "பருத்தி", "cotton")) return Intent.CROP_COTTON;
        if (containsAny(text, "தக்காளி", "tomato")) return Intent.CROP_TOMATO;
        if (containsAny(text, "பயிர்", "பயிர்கள்", "crop", "crops", "விவசாயம்")) return Intent.CROP_GENERAL;

        // 9. Gratitude
        if (containsAny(text, "நன்றி", "மிக்க நன்றி", "சரி நன்றி", "ரொம்ப நன்றி", "புரிந்தது", "சூப்பர்", 
                "thanks", "thank you", "thx", "ok thanks", "ok ok thanks", "awesome", "great")) {
            return Intent.GRATITUDE;
        }

        // 10. Greetings & Identity
        if (containsAny(text, "வணக்கம்", "ஹலோ", "வணக்கம் நண்பா", "நீ யார்", "உங்கள் பெயர்", 
                "hi", "hello", "hey", "who are you", "what is your name")) {
            return Intent.GREETINGS;
        }

        // 11. How are you
        if (containsAny(text, "எப்படி இருக்கிறாய்", "எப்படி இருக்கீங்க", "நலமா", "how are you", "how r u")) {
            return Intent.HOW_ARE_YOU;
        }

        // 12. Farewell
        if (containsAny(text, "நாளை", "வரேன்", "போயிட்டு வரேன்", "பாய்", "விடைபெறுகிறேன்", 
                "bye", "goodbye", "see you tomorrow", "good night")) {
            return Intent.FAREWELL;
        }

        // 13. Help / Navigation
        if (containsAny(text, "உதவி", "எவ்வாறு", "பயன்படுத்துவது", "வழிகாட்டி", "எப்படி பார்க்க முடியும்", 
                "help", "how to use", "guide", "navigation")) {
            return Intent.HELP_NAVIGATION;
        }

        return Intent.GENERAL_AGRICULTURE;
    }

    private static boolean containsAny(String text, String... keywords) {
        for (String k : keywords) {
            if (text.contains(k)) return true;
        }
        return false;
    }

    private static String cleanForSpeech(String text) {
        return text.replaceAll("[*#•_`\\[\\]()]", " ")
                .replaceAll("%", " சதவீதம் ")
                .replaceAll("°C", " டிகிரி செல்சியஸ் ")
                .replaceAll("\\s+", " ")
                .trim();
    }
}
