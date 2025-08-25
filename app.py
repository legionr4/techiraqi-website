# app.py
import os
import uuid
import logging
import urllib.parse
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import snapshot_download
from fastapi.concurrency import run_in_threadpool
from faster_whisper import WhisperModel
from gtts import gTTS
# !!! هام: تحديد المنطقة الافتراضية لمكتبة translators لتجنب مشاكل الاتصال بالإنترنت في PythonAnywhere
os.environ["translators_default_region"] = "EN"
import translators as ts
from translators.server import TranslatorError

# --- إعدادات التسجيل (Logging) ---
# استخدام logging بدلاً من print للحصول على مخرجات أكثر تنظيماً
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


# --- الإعدادات الأولية ---
# تحديد مجلد مؤقت لحفظ الملفات
script_dir = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(script_dir, "temp_audio")
os.makedirs(TEMP_DIR, exist_ok=True)

# !!! هام: تحديد مسار دائم لذاكرة التخزين المؤقت ليكون نسبياً لمكان الملف
CACHE_DIR = os.path.join(script_dir, "hf_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# تحميل نموذج التعرف على الكلام. يمكنك اختيار حجم النموذج حسب قوة جهازك
# "tiny", "base", "small", "medium", "large-v3"
# النموذج "base" جيد كنقطة بداية
# --- Model Configuration ---
# Use an environment variable for model size for flexibility, with "tiny" as a default.
model_size = os.getenv("MODEL_SIZE", "tiny")
logging.info(f"Resolving Whisper model path (using '{model_size}' model)...")
model_path = snapshot_download(
    repo_id=f"Systran/faster-whisper-{model_size}",
    cache_dir=CACHE_DIR,
    # local_files_only=False # نسمح بالتحميل في المرة الأولى للبناء
)
logging.info("Model path resolved to: %s", model_path)

logging.info("Loading Whisper model from path...")
model = WhisperModel(model_path, device="cpu", compute_type="int8")
logging.info("تم تحميل نموذج Whisper بنجاح.")

app = FastAPI()

@app.get("/")
async def root():
    """Provides a welcome message for the root endpoint."""
    return {"message": "Welcome to the Audio Translator API. Use the /translate-audio/ endpoint for translations."}

@app.get("/favicon.ico", include_in_schema=False)
async def get_favicon():
    """Handles favicon.ico requests by returning a 204 No Content response."""
    return Response(status_code=204)

# السماح بالطلبات من واجهة الموقع (مهم جداً)
origins = [
    "http://127.0.0.1:5500",  # لبيئة التطوير المحلية
    "http://localhost",
    "null",  # للسماح بالطلبات من ملفات HTML المفتوحة مباشرة
    "https://techiraqi.netlify.app" # رابط موقعك على Netlify
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
            content = await file.read()
            buffer.write(content)
        logging.info("تم حفظ الملف الصوتي: %s", input_path)

        # 2. تحويل الصوت إلى نص (STT)
        # يتم تشغيل العمليات التي تستهلك المعالج في thread pool لتجنب حظر الخادم
        logging.info("بدء عملية التعرف على الكلام...")
        segments, info = await run_in_threadpool(model.transcribe, input_path, beam_size=5)
        
        detected_lang = info.language
        logging.info("اللغة المكتشفة: %s (بنسبة ثقة: %.2f)", detected_lang, info.language_probability)

        original_text = "".join(segment.text for segment in segments).strip()
        logging.info("النص الأصلي: %s", original_text)

        if not original_text:
            raise HTTPException(status_code=400, detail="لم يتم التعرف على أي كلام في الملف الصوتي.")

        # 3. ترجمة النص (Machine Translation)
        logging.info("بدء عملية الترجمة إلى '%s'...", target_lang)
        translated_text = await run_in_threadpool(
            ts.translate_text,
            query_text=original_text,
            translator='google',
            from_language=detected_lang,
            to_language=target_lang
        )
        logging.info("النص المترجم: %s", translated_text)

        # 4. تحويل النص المترجم إلى صوت (TTS)
        logging.info("بدء عملية تحويل النص إلى كلام...")
        is_slow = slow_speech.lower() == 'true'
        tts = gTTS(text=translated_text, lang=target_lang, slow=is_slow)
        await run_in_threadpool(tts.save, output_path)
        logging.info("تم حفظ الملف الصوتي المترجم: %s", output_path)

        # 5. إرجاع الملف الصوتي المترجم مع النصوص في الترويسات (Headers)
        response = FileResponse(path=output_path, media_type="audio/mpeg", filename="translated_audio.mp3")
        response.headers["X-Original-Text"] = urllib.parse.quote(original_text)
        response.headers["X-Translated-Text"] = urllib.parse.quote(translated_text)
        return response

    except TranslatorError as e:
        logging.error("Translation service failed: %s", e, exc_info=True)
        raise HTTPException(status_code=503, detail="Translation service is currently unavailable. Please try again later.")

    except Exception as e:
        # exc_info=True لتسجيل تفاصيل الخطأ الكاملة (traceback)
        logging.error("An unexpected error occurred: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    finally:
        # تنظيف الملفات المؤقتة بعد الانتهاء
        if os.path.exists(input_path):
            os.remove(input_path)
        # !!! هام: يجب أيضاً حذف الملف الصوتي الناتج لتوفير المساحة
        if 'output_path' in locals() and os.path.exists(output_path):
            os.remove(output_path)