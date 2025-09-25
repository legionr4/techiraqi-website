document.addEventListener('DOMContentLoaded', () => {
    /**
     * Observes a container and changes the text of Netlify Identity's login and signup buttons.
     * This approach is robust against timing issues where the buttons are added dynamically.
     * @param {string} containerSelector - The CSS selector for the container.
     */
    const setupLoginButtonObserver = (containerSelector) => {
        const container = document.querySelector(containerSelector);
        if (!container) {
            // If the container doesn't exist, we can't observe it.
            return;
        }

        const observer = new MutationObserver((mutationsList, obs) => {
            // Check for the buttons on every mutation within the container
            const loginButton = container.querySelector('button:not([data-modified])');
            if (loginButton) {
                // Add icon and text, then mark as modified
                loginButton.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-left: 5px;"></i> Sign In';
                loginButton.setAttribute('data-modified', 'true');
            }

            const signupButton = container.querySelector('button:not([data-modified]) + button');
            if (signupButton) {
                // Add icon and text, then mark as modified
                signupButton.innerHTML = '<i class="fas fa-user-plus" style="margin-left: 5px;"></i> Register';
                signupButton.setAttribute('data-modified', 'true');
            }

        });

        // Start observing the container for any changes to its child elements.
        observer.observe(container, { childList: true, subtree: true });
    };

    // Apply the observer to both desktop and mobile login button containers
    setupLoginButtonObserver('.login-container-desktop');
    setupLoginButtonObserver('.login-container-mobile');
});