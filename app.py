# app.py
import os
import uuid
import urllib.parse
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from gtts import gTTS
# !!! هام: تحديد المنطقة الافتراضية لمكتبة translators لتجنب مشاكل الاتصال بالإنترنت في PythonAnywhere
os.environ["translators_default_region"] = "EN"
import translators as ts

# --- الإعدادات الأولية ---
# تحديد مجلد مؤقت لحفظ الملفات
TEMP_DIR = "temp_audio"
os.makedirs(TEMP_DIR, exist_ok=True)

# !!! هام: تحديد مسار دائم لذاكرة التخزين المؤقت لنماذج Hugging Face داخل مجلدك الرئيسي
CACHE_DIR = "/home/ToperRx/hf_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

# تحميل نموذج التعرف على الكلام. يمكنك اختيار حجم النموذج حسب قوة جهازك
# "tiny", "base", "small", "medium", "large-v3"
# النموذج "base" جيد كنقطة بداية
print("تحميل نموذج Whisper...")
model_size = "base" 
# استخدم "cuda" إذا كان لديك كرت شاشة NVIDIA، أو "cpu"
model = WhisperModel(model_size, device="cpu", compute_type="int8", cache_dir=CACHE_DIR, local_files_only=True)
print("تم تحميل نموذج Whisper بنجاح.")

app = FastAPI()

# السماح بالطلبات من واجهة الموقع (مهم جداً)
origins = [
    "http://127.0.0.1:5500",  # لبيئة التطوير المحلية
    "http://localhost",
    "null",  # للسماح بالطلبات من ملفات HTML المفتوحة مباشرة
    "https://techiraqi.netlify.app", # رابط موقعك على Netlify
    "http://ToperRx.pythonanywhere.com" # رابط خادمك على PythonAnywhere
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # !!! هام: السماح للواجهة الأمامية بقراءة الترويسات المخصصة
    expose_headers=["X-Original-Text", "X-Translated-Text"],
)

# --- نقطة نهاية بسيطة لإبقاء الخادم مستيقظاً (لخدمات المراقبة) ---
@app.get("/health")
def health_check():
    """
    Endpoint بسيط جداً يمكن لخدمات المراقبة مثل UptimeRobot استدعاؤه.
    """
    return {"status": "ok", "message": "Server is running."}

# --- نقطة النهاية (Endpoint) لترجمة الصوت ---
@app.post("/translate-audio/")
async def translate_audio(
    file: UploadFile = File(...),
    target_lang: str = Form("en"),
    slow_speech: str = Form("false") # المعلمة الجديدة لسرعة الكلام
):
    # إنشاء اسم فريد للملف لتجنب التضارب
    file_id = str(uuid.uuid4())
    input_path = os.path.join(TEMP_DIR, f"{file_id}_input.wav")
    output_path = os.path.join(TEMP_DIR, f"{file_id}_output.mp3")

    try:
        # 1. حفظ الملف الصوتي المستلم
        with open(input_path, "wb") as buffer:
            buffer.write(await file.read())
        print(f"تم حفظ الملف الصوتي: {input_path}")

        # 2. تحويل الصوت إلى نص (STT)
        print("بدء عملية التعرف على الكلام...")
        segments, info = model.transcribe(input_path, beam_size=5)
        
        detected_lang = info.language
        print(f"اللغة المكتشفة: {detected_lang} (بنسبة ثقة: {info.language_probability:.2f})")

        original_text = "".join(segment.text for segment in segments).strip()
        print(f"النص الأصلي: {original_text}")

        if not original_text:
            raise HTTPException(status_code=400, detail="لم يتم التعرف على أي كلام في الملف الصوتي.")

        # 3. ترجمة النص (Machine Translation)
        print(f"بدء عملية الترجمة إلى '{target_lang}'...")
        translated_text = ts.translate_text(
            original_text, 
            translator='google', 
            from_language=detected_lang, 
            to_language=target_lang
        )
        print(f"النص المترجم: {translated_text}")

        # 4. تحويل النص المترجم إلى صوت (TTS)
        print("بدء عملية تحويل النص إلى كلام...")
        is_slow = slow_speech.lower() == 'true'
        tts = gTTS(text=translated_text, lang=target_lang, slow=is_slow)
        tts.save(output_path)
        print(f"تم حفظ الملف الصوتي المترجم: {output_path}")

        # 5. إرجاع الملف الصوتي المترجم مع النصوص في الترويسات (Headers)
        response = FileResponse(path=output_path, media_type="audio/mpeg", filename="translated_audio.mp3")
        response.headers["X-Original-Text"] = urllib.parse.quote(original_text)
        response.headers["X-Translated-Text"] = urllib.parse.quote(translated_text)
        return response

    except Exception as e:
        print(f"حدث خطأ: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # تنظيف الملفات المؤقتة بعد الانتهاء
        if os.path.exists(input_path):
            os.remove(input_path)