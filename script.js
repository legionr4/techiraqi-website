document.addEventListener('DOMContentLoaded', function() {

    // --- Hamburger Menu Logic ---
    const hamburgerButton = document.getElementById('hamburger-button');
    const mainNav = document.getElementById('main-nav');

    if (hamburgerButton && mainNav) {
        hamburgerButton.addEventListener('click', function() {
            // Toggle the .active class on the navigation menu
            mainNav.classList.toggle('active');

            // Toggle the aria-expanded attribute for accessibility
            const isExpanded = hamburgerButton.getAttribute('aria-expanded') === 'true';
            hamburgerButton.setAttribute('aria-expanded', !isExpanded);
        });
    }

    // --- AOS (Animate On Scroll) Library Initialization ---
    // Check if AOS is defined before initializing
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 1000, // زيادة مدة التحريك لجعله أكثر نعومة
            easing: 'ease-in-out', // استخدام دالة تسريع مختلفة لشعور أكثر سلاسة
            once: true, // Animation happens only once
        });
    }

    // --- Netlify Identity Logic ---
    // Check if netlifyIdentity is defined
    if (typeof netlifyIdentity !== 'undefined') {
        // Show welcome message on login
        netlifyIdentity.on('login', user => {
            netlifyIdentity.close(); // Close the login modal
            const protectedContent = document.querySelector('.protected-content');
            if (protectedContent) {
                protectedContent.style.display = 'block';
                const welcomeMessage = document.getElementById('welcome-message');
                if (welcomeMessage) {
                    const name = user.user_metadata.full_name || user.email.split('@')[0];
                    welcomeMessage.textContent = `أهلاً بك مجدداً، ${name}!`;
                }
            }
        });

        // Hide content on logout
        netlifyIdentity.on('logout', () => {
            const protectedContent = document.querySelector('.protected-content');
            if (protectedContent) {
                protectedContent.style.display = 'none';
            }
        });
    }

    // --- Back to Top Button Logic ---
    const backToTopButton = document.querySelector('.back-to-top');

    if (backToTopButton) {
        // Show or hide the button based on scroll position
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) { // Show button after scrolling 300px
                backToTopButton.classList.add('show');
            } else {
                backToTopButton.classList.remove('show');
            }
        });

        // Smooth scroll to top on click
        backToTopButton.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent default anchor behavior
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- Dark Mode Logic ---
    const themeToggleButtons = document.querySelectorAll('.theme-toggle-button');
    const body = document.body;

    if (themeToggleButtons.length > 0) {
        const toggleIcons = document.querySelectorAll('.theme-toggle-button i');
        const mobileToggleSpan = document.querySelector('.mobile-nav-item .theme-toggle-button span');

        const enableDarkMode = () => {
            body.classList.add('dark-mode');
            toggleIcons.forEach(icon => {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            });
            if (mobileToggleSpan) mobileToggleSpan.textContent = 'الوضع النهاري';
            themeToggleButtons.forEach(button => button.setAttribute('title', 'تفعيل الوضع النهاري'));
            localStorage.setItem('theme', 'dark');
        };

        const disableDarkMode = () => {
            body.classList.remove('dark-mode');
            toggleIcons.forEach(icon => {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            });
            if (mobileToggleSpan) mobileToggleSpan.textContent = 'الوضع الليلي';
            themeToggleButtons.forEach(button => button.setAttribute('title', 'تفعيل الوضع الليلي'));
            localStorage.setItem('theme', 'light');
        };

        // Check for saved theme in localStorage or system preference
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark' || (!currentTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            enableDarkMode();
        }

        // Add event listener to all toggle buttons
        themeToggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (body.classList.contains('dark-mode')) {
                    disableDarkMode();
                } else {
                    enableDarkMode();
                }
            });
        });
    }

    // --- Dynamic Copyright Year ---
    const copyrightYearSpan = document.getElementById('copyright-year');
    if (copyrightYearSpan) {
        copyrightYearSpan.textContent = new Date().getFullYear();
    }

    // --- Blog Search Logic ---
    const searchForm = document.getElementById('blog-search-form');

    if (searchForm) {
        const searchInput = document.getElementById('blog-search-input');
        const articleCards = document.querySelectorAll('.article-card');
        const noResultsMessage = document.getElementById('no-results-message');

        // Prevent form submission from reloading the page
        searchForm.addEventListener('submit', (e) => e.preventDefault());

        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase().trim();
            let visibleArticles = 0;

            articleCards.forEach(card => {
                const title = card.querySelector('h3 a').textContent.toLowerCase();
                const excerpt = card.querySelector('.article-excerpt').textContent.toLowerCase();
                const isVisible = title.includes(searchTerm) || excerpt.includes(searchTerm);
                
                if (isVisible) {
                    card.style.display = 'block';
                    visibleArticles++;
                } else {
                    card.style.display = 'none';
                }
            });

            // Show or hide the "no results" message
            noResultsMessage.style.display = visibleArticles > 0 ? 'none' : 'block';
        });
    }

    // --- Social Share Logic ---
    const shareSection = document.querySelector('.share-section');

    if (shareSection) {
        const copyLinkButton = document.getElementById('copy-link-btn');
        const copySuccessMsg = document.getElementById('copy-success-msg');

        const pageUrl = window.location.href;
        const pageTitle = document.title;

        // Handle social network sharing
        shareSection.addEventListener('click', function(e) {
            const target = e.target.closest('.share-btn');
            if (!target || !target.dataset.network) return;

            e.preventDefault();
            const network = target.dataset.network;
            let shareUrl = '';

            switch (network) {
                case 'twitter':
                    shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`;
                    break;
                case 'facebook':
                    shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
                    break;
                case 'linkedin':
                    shareUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(pageTitle)}`;
                    break;
                case 'whatsapp':
                    shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(pageTitle + ' ' + pageUrl)}`;
                    break;
            }

            if (shareUrl) {
                window.open(shareUrl, '_blank', 'width=600,height=400,noopener,noreferrer');
            }
        });

        // Handle copy link button
        if (copyLinkButton) {
            copyLinkButton.addEventListener('click', () => {
                navigator.clipboard.writeText(pageUrl).then(() => {
                    copySuccessMsg.style.display = 'block';
                    setTimeout(() => {
                        copySuccessMsg.style.display = 'none';
                    }, 2000); // Hide message after 2 seconds
                }).catch(err => console.error('Failed to copy: ', err));
            });
        }
    }
});