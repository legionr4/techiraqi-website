document.addEventListener('DOMContentLoaded', () => {
    // --- Utility Functions ---

    /**
     * Creates a debounced function that delays invoking `func` until after `delay` milliseconds have elapsed
     * since the last time the debounced function was invoked.
     */
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // --- Feature Initializers ---

    /**
     * Initializes the theme toggle (dark/light mode).
     */
    const initTheme = () => {
        const themeToggleButtons = document.querySelectorAll('.theme-toggle-button');
        const currentTheme = localStorage.getItem('theme') || 'light';

        if (currentTheme === 'dark') {
            document.body.classList.add('dark-mode');
        }

        const setIcon = (isDark) => {
            themeToggleButtons.forEach(button => {
                const icon = button.querySelector('i');
                if (isDark) {
                    icon.classList.remove('fa-moon');
                    icon.classList.add('fa-sun');
                    button.title = "تفعيل الوضع الفاتح";
                } else {
                    icon.classList.remove('fa-sun');
                    icon.classList.add('fa-moon');
                    button.title = "تفعيل الوضع الليلي";
                }
            });
        };

        setIcon(currentTheme === 'dark');

        themeToggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                const theme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
                localStorage.setItem('theme', theme);
                setIcon(theme === 'dark');
            });
        });
    };

    /**
     * Initializes the hamburger menu for mobile navigation.
     */
    const initHamburgerMenu = () => {
        const hamburgerButton = document.getElementById('hamburger-button');
        const mainNav = document.getElementById('main-nav');

        if (!hamburgerButton || !mainNav) return;

        const navLinks = mainNav.querySelectorAll('a');

        const toggleMenu = (forceClose = false) => {
            const isExpanded = mainNav.classList.contains('active');
            const icon = hamburgerButton.querySelector('i');

            if (isExpanded || forceClose) {
                mainNav.classList.remove('active');
                hamburgerButton.setAttribute('aria-expanded', 'false');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            } else {
                mainNav.classList.add('active');
                hamburgerButton.setAttribute('aria-expanded', 'true');
                if (icon) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                }
            }
        };

        hamburgerButton.addEventListener('click', () => toggleMenu());

        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                // إغلاق القائمة عند الضغط على أي رابط بداخلها (مهم لنسخة الموبايل)
                if (mainNav.classList.contains('active')) {
                    toggleMenu(true); // إجبار القائمة على الإغلاق
                }
            });
        });
    };

    /**
     * Initializes the FAQ accordion functionality.
     */
    const initFaqAccordion = () => {
        const faqItems = document.querySelectorAll('.faq-item');
        if (!faqItems.length) return;

        faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            const answer = item.querySelector('.faq-answer');
            const icon = question.querySelector('.fas');

            question.addEventListener('click', () => {
                const isExpanded = question.getAttribute('aria-expanded') === 'true';

                // Close all other items for a cleaner accordion experience
                faqItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
                        otherItem.querySelector('.faq-answer').style.maxHeight = null;
                        otherItem.querySelector('.fas').classList.replace('fa-minus', 'fa-plus');
                    }
                });

                // Toggle the clicked item
                question.setAttribute('aria-expanded', !isExpanded);
                answer.style.maxHeight = isExpanded ? null : answer.scrollHeight + "px";
                icon.classList.toggle('fa-plus');
                icon.classList.toggle('fa-minus');
            });
        });
    };

    /**
     * Initializes the "Back to Top" button.
     */
    const initBackToTopButton = () => {
        const backToTopButton = document.querySelector('.back-to-top');
        if (backToTopButton) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 300) {
                    backToTopButton.classList.add('show');
                } else {
                    backToTopButton.classList.remove('show');
                }
            });
            backToTopButton.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    };

    /**
     * Updates the copyright year in the footer.
     */
    const updateCopyrightYear = () => {
        const yearSpan = document.getElementById('copyright-year');
        if (yearSpan) {
            yearSpan.textContent = new Date().getFullYear();
        }
    };

    /**
     * Initializes the social share buttons and copy link functionality on article pages.
     */
    const initArticlePage = () => {
        // Guard clause: only run this on pages with a share section.
        const shareSection = document.querySelector('.share-section');
        if (!shareSection) {
            return;
        }

        const pageUrl = window.location.href;
        const pageTitle = document.title;

        // Dynamic share links
        const shareLinks = {
            twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`,
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
            linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(pageTitle)}`,
            whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(pageTitle + " " + pageUrl)}`
        };

        document.querySelectorAll('.share-btn[data-network]').forEach(button => {
            const network = button.dataset.network;
            if (shareLinks[network]) {
                button.href = shareLinks[network];
            }
        });

        // "Copy Link" button functionality
        const copyBtn = document.getElementById('copy-link-btn');
        const copySuccessMsg = document.getElementById('copy-success-msg');

        if (copyBtn && copySuccessMsg) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(pageUrl).then(() => {
                    copySuccessMsg.style.display = 'block';
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> تم النسخ';
                    copyBtn.disabled = true;

                    setTimeout(() => {
                        copySuccessMsg.style.display = 'none';
                        copyBtn.innerHTML = '<i class="fas fa-link"></i> نسخ الرابط';
                        copyBtn.disabled = false;
                    }, 2500);
                }).catch(err => {
                    console.error('Failed to copy link: ', err);
                    alert('فشل نسخ الرابط، يرجى نسخه يدوياً.');
                });
            });
        }
    };

    /**
     * Initializes the live search functionality on the blog page.
     */
    const initBlogSearch = () => {
        const searchInput = document.getElementById('blog-search-input');
        const searchForm = document.getElementById('blog-search-form');
        const articles = document.querySelectorAll('.article-card');
        const noResultsMessage = document.getElementById('no-results-message');

        // Guard clause: only run if all required elements are on the page.
        if (!searchInput || !searchForm || !articles.length || !noResultsMessage) {
            return;
        }

        // Prevent the form from submitting and reloading the page.
        searchForm.addEventListener('submit', (e) => e.preventDefault());

        const filterArticles = () => {
            const searchTerm = searchInput.value.toLowerCase().trim();
            let visibleCount = 0;

            articles.forEach(article => {
                const title = article.querySelector('h3 a')?.textContent.toLowerCase() || '';
                const excerpt = article.querySelector('.article-excerpt')?.textContent.toLowerCase() || '';
                
                // Check if the search term is in the title or excerpt
                const isVisible = title.includes(searchTerm) || excerpt.includes(searchTerm);

                // Show or hide the article card based on the search result
                article.style.display = isVisible ? '' : 'none';

                if (isVisible) {
                    visibleCount++;
                }
            });

            // Show or hide the "no results" message
            noResultsMessage.style.display = visibleCount === 0 ? 'block' : 'none';
        };

        // Use debounce to prevent filtering on every single keystroke, improving performance.
        const debouncedFilter = debounce(filterArticles, 300); // 300ms delay
        searchInput.addEventListener('input', debouncedFilter);
    };

    // --- Preloader ---
    const preloader = document.getElementById('preloader');
    if (preloader) {
        const hidePreloader = () => {
            // Start fading out
            preloader.style.opacity = '0';
            // After the fade-out transition ends, set display to none
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500); // This should match the transition duration in your CSS
        };

        // Hide when all resources (images, etc.) are loaded
        window.addEventListener('load', hidePreloader);

        // Fallback: Hide after 3 seconds anyway, in case 'load' event fails (e.g., broken image)
        setTimeout(hidePreloader, 3000);
    }

    // --- Smart Page Router ---
    // This router runs specific JavaScript code based on the current page URL.
    const SmartPageRouter = {
        common: {
            init: function() {
                initTheme();
                initHamburgerMenu();
                initBackToTopButton();
                updateCopyrightYear();
                initFaqAccordion();
                initArticlePage(); // Initialize article page features (sharing, etc.)

                // Initialize AOS (Animate On Scroll) library
                if (typeof AOS !== 'undefined') {
                    AOS.init({
                        duration: 800, // مدة الحركة
                        once: true,    // تشغيل الحركة مرة واحدة فقط
                        offset: 50,    // إزاحة لتشغيل الحركة قبل ظهور العنصر
                    });
                }
            }
        },
        '/blog.html': {
            init: function() {
                initBlogSearch();
            }
        }
        // Add other page-specific routes here if needed
        // e.g., '/contact.html': { init: function() { initContactForm(); } }
    };

    const executeRoutes = () => {
        const path = window.location.pathname;
        
        // Run common scripts
        SmartPageRouter.common.init();

        // Run page-specific scripts
        if (SmartPageRouter[path]) {
            SmartPageRouter[path].init();
        }
    };

    executeRoutes(); // Run the router
});
ئ