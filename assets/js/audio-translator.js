document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const audioFileInput = document.getElementById('audio-file-input');
    const recordBtn = document.getElementById('record-btn');
    const recordedAudioPlayer = document.getElementById('recorded-audio-player');
    const languageSelect = document.getElementById('language-select');
    const speedSelect = document.getElementById('speed-select');
    const translateBtn = document.getElementById('translate-btn');
    const loader = document.getElementById('translator-loader');
    const errorDisplay = document.getElementById('error-display');
    const transcribedText = document.getElementById('transcribed-text');
    const copyBtn = document.getElementById('copy-btn');
    const copyTranscribedBtn = document.getElementById('copy-transcribed-btn');
    const translatedText = document.getElementById('translated-text');
    const ttsOutputContainer = document.getElementById('tts-output-container');
    const ttsAudioPlayer = document.getElementById('tts-audio-player');
    const downloadTtsLink = document.getElementById('download-tts-link');
    const loaderText = document.getElementById('loader-text');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const spinner = document.querySelector('#translator-loader .spinner');
    const resetBtn = document.getElementById('reset-btn');
    const currentTimeEl = document.getElementById('current-time');
    const totalDurationEl = document.getElementById('total-duration');
    const recordingStatus = document.getElementById('recording-status');
    const recordingTimer = document.getElementById('recording-timer');
    const audioErrorContainer = document.getElementById('audio-error-container');
    const retryAudioBtn = document.getElementById('retry-audio-btn');
    const audioTimeDisplay = document.querySelector('.audio-time-display');
    const audioPreviewContainer = document.getElementById('audio-preview-container');
    const clearAudioBtn = document.getElementById('clear-audio-btn');

    // --- State Variables ---
    let mediaRecorder;
    let audioChunks = [];
    let audioBlob = null;
    let isRecording = false;
    const HUGGING_FACE_API_URL = "https://toprn-audiotranslator.hf.space/run/translate_audio_file"; // The correct URL for your backend
    const API_TIMEOUT = 300000; // 5 minutes in milliseconds
    const HUGGING_FACE_FILE_URL = "https://toprn-audiotranslator.hf.space/file="; // The correct URL for serving files
    let recordingInterval;

    // --- Collapsible Fieldsets ---
    document.querySelectorAll('legend').forEach(legend => {
        legend.addEventListener('click', () => {
            // Toggle the 'collapsed' class on the legend itself
            legend.classList.toggle('collapsed');
            // Find the next sibling element which is the content
            const content = legend.nextElementSibling;
            if (content && content.classList.contains('collapsible-content')) {
                content.classList.toggle('collapsed');
            }
        });
    });




    // --- Functions ---
    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const updateTranslateButtonState = () => {
        const hasAudio = !!audioBlob;
        translateBtn.disabled = !hasAudio;

        if (hasAudio) {
            resetBtn.classList.remove('hidden');
        } else {
            resetBtn.classList.add('hidden');
        }
    };

    const resetProcessingState = () => {
        loader.classList.add('hidden');
        // Re-enable the translate button only if there's audio
        updateTranslateButtonState();
        translateBtn.innerHTML = 'الخطوة 3: ترجم الآن <i class="fas fa-language"></i>';
        spinner.classList.remove('hidden');
        progressContainer.classList.add('hidden');
        loaderText.textContent = 'جاري المعالجة...';
        progressBar.style.width = '0%';
        resetBtn.innerHTML = '<i class="fas fa-sync-alt"></i>'; // Change back to reset icon
    };

    const clearResults = () => {
        errorDisplay.classList.add('hidden');
        transcribedText.value = '';
        copyTranscribedBtn.disabled = true;
        copyBtn.disabled = true;
        translatedText.value = '';
        ttsOutputContainer.classList.add('hidden');
        ttsAudioPlayer.src = '';
        downloadTtsLink.href = '#';
        downloadTtsLink.classList.add('hidden');
        currentTimeEl.textContent = '00:00';
        totalDurationEl.textContent = '00:00';
        audioErrorContainer.classList.add('hidden');
        audioTimeDisplay.classList.remove('hidden');
    };

    const resetUI = () => {
        resetProcessingState();
        clearResults();
    };
    
    let abortController = null;


    const fetchWithProgress = (url, opts = {}, onProgress) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(opts.method || 'get', url);

            for (const k in opts.headers || {}) {
                xhr.setRequestHeader(k, opts.headers[k]);
            }

            if (opts.signal) {
                opts.signal.addEventListener('abort', () => xhr.abort());
            }

            xhr.onload = e => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve({
                            ok: true,
                            status: xhr.status,
                            json: () => Promise.resolve(JSON.parse(e.target.responseText))
                        });
                    } catch (parseError) {
                        reject(new Error("Failed to parse JSON response."));
                    }
                } else {
                    resolve({
                        ok: false,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        json: () => {
                            try { return Promise.resolve(JSON.parse(e.target.responseText)); } 
                            catch { return Promise.resolve({}); }
                        }
                    });
                }
            };

            xhr.onerror = () => reject(new TypeError('فشل طلب الشبكة.'));
            xhr.onabort = () => reject({ name: 'AbortError', message: 'تم إلغاء الطلب.' });
            xhr.ontimeout = () => reject(new Error('انتهت مهلة الطلب.'));
            xhr.timeout = API_TIMEOUT;
            if (xhr.upload && onProgress) xhr.upload.onprogress = onProgress;

            xhr.send(opts.body);
        });
    };

    const handleApiError = async (error, response = null) => {
        console.error('API Error:', error);
        let message;

        if (error.name === 'AbortError') {
            message = 'تم إلغاء عملية الترجمة.';
        } else if (error.message.includes('مهلة الطلب')) {
            message = 'استغرقت العملية وقتاً طويلاً جداً. يرجى المحاولة مرة أخرى أو تجربة ملف أصغر.';
        } else if (response) {
            if (response.status === 429) {
                message = 'لقد وصلت إلى الحد الأقصى للطلبات. يرجى الانتظار قليلاً قبل المحاولة مرة أخرى.';
            } else if (response.status === 503) {
                message = 'الخدمة مشغولة حاليًا أو قيد التحميل (Cold Start). يرجى المحاولة مرة أخرى بعد دقيقة.';
            } else {
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        message = `خطأ من الخادم: ${errorData.error}. قد يكون الملف الصوتي غير صالح.`;
                    } else {
                        message = `حدث خطأ في الخادم (الحالة: ${response.status}).`;
                    }
                } catch (e) {
                    message = `حدث خطأ في الخادم (الحالة: ${response.status}). لا يمكن قراءة تفاصيل الخطأ.`;
                }
            }
        } else {
            message = 'حدث خطأ غير متوقع. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.';
        }

        errorDisplay.textContent = message;
        errorDisplay.classList.remove('hidden');
        resetUI();
    };

    const cancelTranslation = () => {
        if (abortController) {
            abortController.abort();
            console.log("Translation cancelled by user.");
        }
    };

    const fullReset = () => {
        // Stop recording if it's active
        if (isRecording && mediaRecorder) {
            // The onstop handler will manage resetting the record button UI
            clearInterval(recordingInterval);
            recordingStatus.classList.add('hidden'); 
            mediaRecorder.stop();
        }

        // Clear audio state
        audioBlob = null;
        audioFileInput.value = ''; // This is crucial for file input
        recordedAudioPlayer.src = '';
        audioPreviewContainer.classList.add('hidden'); // Hide the entire preview container

        // Clear results and loader state
        resetUI(); 
        // Update buttons state (this will disable translate and hide reset)
        updateTranslateButtonState();
    };

    const handleResetOrCancel = () => {
        // If the loader is visible, it means we are in a processing state, so we cancel.
        // Otherwise, we perform a full reset.
        loader.classList.contains('hidden') ? fullReset() : cancelTranslation();
    };

    const clearAudioSelection = () => {
        audioBlob = null;
        audioFileInput.value = ''; // Reset file input
        recordedAudioPlayer.src = ''; // Clear the player source
        audioPreviewContainer.classList.add('hidden'); // Hide the container
        updateTranslateButtonState();
    };

    // --- User Preferences ---
    const loadPreferences = () => {
        const savedLanguage = localStorage.getItem('translator_last_language');
        // Ensure the saved language is a valid option before setting it
        if (savedLanguage && [...languageSelect.options].some(opt => opt.value === savedLanguage)) {
            languageSelect.value = savedLanguage;
        }
        const savedSpeed = localStorage.getItem('translator_last_speed');
        if (savedSpeed && [...speedSelect.options].some(opt => opt.value === savedSpeed)) {
            speedSelect.value = savedSpeed;
        }
        // Set the initial playback rate from the current selection
        ttsAudioPlayer.playbackRate = parseFloat(speedSelect.value);
    };

    const savePreferences = () => {
        localStorage.setItem('translator_last_language', languageSelect.value);
        localStorage.setItem('translator_last_speed', speedSelect.value);
    };

    const handleAudioReady = () => {
        downloadTtsLink.classList.remove('hidden');
        // Ensure error state is cleared and time is visible
        audioErrorContainer.classList.add('hidden');
        audioTimeDisplay.classList.remove('hidden');
    };

    const handleAudioLoadError = () => {
        console.error("Audio player error:", ttsAudioPlayer.error);
        audioTimeDisplay.classList.add('hidden');
        downloadTtsLink.classList.add('hidden');
        audioErrorContainer.classList.remove('hidden');
    };

    const retryAudioLoad = () => {
        audioErrorContainer.classList.add('hidden');
        ttsAudioPlayer.load(); // This will re-trigger the loading process
    };

    // --- Initial Setup ---
    loadPreferences();

    // --- Event Listeners ---
    resetBtn.addEventListener('click', handleResetOrCancel);

    retryAudioBtn.addEventListener('click', retryAudioLoad);

    clearAudioBtn.addEventListener('click', clearAudioSelection);

    audioFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
            audioBlob = file;
            const audioUrl = URL.createObjectURL(file);
            recordedAudioPlayer.src = audioUrl;
            audioPreviewContainer.classList.remove('hidden');
            updateTranslateButtonState();
        }
    });

    languageSelect.addEventListener('change', savePreferences);

    speedSelect.addEventListener('change', () => {
        const newSpeed = parseFloat(speedSelect.value);
        ttsAudioPlayer.playbackRate = newSpeed;
        savePreferences();
    });

    ttsAudioPlayer.addEventListener('canplay', handleAudioReady);

    ttsAudioPlayer.addEventListener('error', handleAudioLoadError);

    ttsAudioPlayer.addEventListener('loadedmetadata', () => {
        totalDurationEl.textContent = formatTime(ttsAudioPlayer.duration);
    });

    ttsAudioPlayer.addEventListener('timeupdate', () => {
        currentTimeEl.textContent = formatTime(ttsAudioPlayer.currentTime);
    });


    recordBtn.addEventListener('click', async () => {
        if (isRecording) {
            clearInterval(recordingInterval);
            recordingStatus.classList.add('hidden');
            mediaRecorder.stop();
            // The onstop handler will manage the rest of the UI update
        } else {
            // Start recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    recordedAudioPlayer.src = URL.createObjectURL(audioBlob);
                    audioPreviewContainer.classList.remove('hidden');
                    updateTranslateButtonState();
                    stream.getTracks().forEach(track => track.stop());

                    // Reset recording state and UI
                    isRecording = false;
                    recordBtn.innerHTML = 'سجل من المايكروفون <i class="fas fa-microphone"></i>';
                    recordBtn.style.backgroundColor = ''; // Revert to stylesheet color
                };

                mediaRecorder.start();

                // Update recording state and UI
                isRecording = true;
                recordBtn.innerHTML = 'أوقف التسجيل <i class="fas fa-stop"></i>';
                recordBtn.style.backgroundColor = '#d9534f'; // A red color for "stop"
                updateTranslateButtonState();
                audioPreviewContainer.classList.add('hidden'); // Hide old recording preview
                errorDisplay.classList.add('hidden'); // Hide any previous errors

                // Reset and show timer
                recordingTimer.textContent = '00:00';
                recordingStatus.classList.remove('hidden');
                let recordingSeconds = 0;
                recordingInterval = setInterval(() => {
                    recordingSeconds++;
                    recordingTimer.textContent = formatTime(recordingSeconds);
                }, 1000);

            } catch (err) {
                console.error("Error accessing microphone:", err);
                errorDisplay.textContent = "لم نتمكن من الوصول إلى المايكروفون. يرجى التأكد من منح الإذن اللازم في متصفحك.";
                errorDisplay.classList.remove('hidden');
                recordBtn.disabled = true;
                recordingStatus.classList.add('hidden');
                clearInterval(recordingInterval);
            }
        }
    });

    translateBtn.addEventListener('click', async () => {
        if (!audioBlob) { return alert('الرجاء اختيار ملف صوتي أو تسجيل مقطع أولاً.'); }
        
        abortController = new AbortController();

        try {
            const base64Audio = await fileToBase64(audioBlob);
            const targetLanguage = languageSelect.value;
            const payload = {
                "data": [
                    { "name": audioBlob.name || "recording.wav", "data": base64Audio },
                    targetLanguage
                ]
            };

            // --- UI Update for Upload ---
            clearResults(); // Reset previous results
            loader.classList.remove('hidden');
            translateBtn.disabled = true;
            translateBtn.textContent = 'جاري الرفع...';
            resetBtn.innerHTML = '<i class="fas fa-times"></i>';
            spinner.classList.add('hidden');
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '0%';
            loaderText.textContent = 'جاري الرفع... 0%';

            const onUploadProgress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    progressBar.style.width = `%`;
                    loaderText.textContent = `جاري الرفع... %`;
                }
            };

            const response = await fetchWithProgress(HUGGING_FACE_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: abortController.signal
            }, onUploadProgress);

            // --- UI Update for Processing ---
            progressContainer.classList.add('hidden');
            spinner.classList.remove('hidden');
            loaderText.textContent = 'جاري المعالجة...';
            if (!response.ok) {
                await handleApiError(new Error('Server responded with an error'), response);
                return;
            }

            const result = await response.json();
            const [transcription, translation, ttsFile] = result.data;
            transcribedText.value = transcription || "لم يتم التعرف على كلام.";
            if (transcription) {
                copyTranscribedBtn.disabled = false;
            }
            if (translation) {
                translatedText.value = translation;
                copyBtn.disabled = false; // Enable copy button
            } else {
                translatedText.value = "فشلت الترجمة.";
                copyBtn.disabled = true; // Ensure it's disabled
            }

            if (ttsFile && ttsFile.name) {
                const ttsUrl = HUGGING_FACE_FILE_URL + ttsFile.name;
                ttsAudioPlayer.src = ttsUrl;
                downloadTtsLink.href = ttsUrl;
                downloadTtsLink.download = "translated_audio.wav";
                ttsOutputContainer.classList.remove('hidden');
            }
        } catch (error) {
            await handleApiError(error);
        } finally {
            abortController = null;
            resetProcessingState();
        }
    });

    const setupCopyButton = (button, textarea) => {
        button.addEventListener('click', () => {
            const textToCopy = textarea.value;
            if (!textToCopy || button.disabled) return;

            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalIcon = button.innerHTML;
                const originalTitle = button.title;
                button.innerHTML = '<i class="fas fa-check"></i>';
                button.title = 'تم النسخ!';
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                    button.title = originalTitle;
                }, 2000);
            }).catch(err => { console.error('Failed to copy text: ', err); });
        });
    };
    setupCopyButton(copyBtn, translatedText);
    setupCopyButton(copyTranscribedBtn, transcribedText);
});
