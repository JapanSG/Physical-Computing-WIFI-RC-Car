/*
  Updated script.js: removed control/button/keyboard sending logic and added copy-to-clipboard
  behavior for the ESP32 IP display. Other functionality (gallery, Arduino loader, mobile nav)
  remains.
*/

(() => {
    const carousel = document.getElementById('carousel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    // Mobile nav elements
    const menuToggle = document.getElementById('menuToggle');
    const topNav = document.getElementById('topNav');
    const mobileOverlay = document.getElementById('mobileOverlay');

    function openMobileNav() {
        topNav.classList.add('open');
        menuToggle.setAttribute('aria-expanded', 'true');
        mobileOverlay.classList.add('show');
        mobileOverlay.hidden = false;
        document.documentElement.style.overflow = 'hidden';
    }
    function closeMobileNav() {
        topNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        mobileOverlay.classList.remove('show');
        mobileOverlay.hidden = true;
        document.documentElement.style.overflow = '';
    }
    function toggleMobileNav() {
        if (topNav.classList.contains('open')) closeMobileNav();
        else openMobileNav();
    }

    menuToggle.addEventListener('click', toggleMobileNav);
    mobileOverlay.addEventListener('click', closeMobileNav);

    // close the sidebar when a nav link is clicked (mobile)
    document.querySelectorAll('#topNav a').forEach(a => {
        a.addEventListener('click', () => {
            if (window.matchMedia('(max-width:800px)').matches) closeMobileNav();
        });
    });

    // close on Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && topNav.classList.contains('open')) {
            closeMobileNav();
        }
    });

    // If server exposes directory listing, this will parse it. Otherwise add filenames to fallbackImages.
    const fallbackImages = [
        // Add image filenames relative to site/images here, e.g. "front.jpg", "left-45.jpg"
        // "front.jpg", "left.jpg", "right.jpg"
    ];

    async function tryLoadImagesFromFolder() {
        try {
            const resp = await fetch('images/');
            if (!resp.ok) throw new Error('no listing');
            const html = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = Array.from(doc.querySelectorAll('a'))
                .map(a => a.getAttribute('href'))
                .filter(h => h && /\.(jpe?g|png|gif|webp)$/i.test(h));
            if (links.length) {
                return links.map(l => {
                    if (/^https?:\/\//i.test(l)) return l;
                    const parts = l.split('/').filter(Boolean);
                    const filename = parts[parts.length - 1];
                    return 'images/' + filename;
                });
            }
        } catch (e) {
            // ignore and fall back
        }
        return fallbackImages.map(fn => 'images/' + fn);
    }

    function makeImgEl(src, alt) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt || src;
        img.loading = 'lazy';
        return img;
    }

    function populateCarousel(imgUrls) {
        carousel.innerHTML = '';
        if (!imgUrls.length) {
            const p = document.createElement('p');
            p.className = 'muted';
            p.textContent = 'No images found in site/images. Add files to that folder or update fallbackImages in script.js.';
            carousel.appendChild(p);
            return;
        }
        imgUrls.forEach(url => {
            const img = makeImgEl(url, url.split('/').pop());
            carousel.appendChild(img);
        });
    }

    function scrollNext() {
        carousel.scrollBy({ left: carousel.clientWidth * 0.7, behavior: 'smooth' });
    }
    function scrollPrev() {
        carousel.scrollBy({ left: -carousel.clientWidth * 0.7, behavior: 'smooth' });
    }

    prevBtn.addEventListener('click', scrollPrev);
    nextBtn.addEventListener('click', scrollNext);

    // COPY IP functionality (replaces controls)
    const copyBtn = document.getElementById('copyIpBtn');
    const ipInput = document.getElementById('espIp');

    if (copyBtn && ipInput) {
        copyBtn.addEventListener('click', async () => {
            const text = ipInput.value || ipInput.getAttribute('value') || ipInput.textContent || 'http://192.168.4.1';
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    // fallback
                    ipInput.select();
                    document.execCommand('copy');
                    window.getSelection().removeAllRanges();
                }
                const prev = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                copyBtn.disabled = true;
                setTimeout(() => {
                    copyBtn.textContent = prev;
                    copyBtn.disabled = false;
                }, 1400);
            } catch (err) {
                alert('Copy failed. IP: ' + text);
            }
        });
    }

    // Arduino source loader
    const codeView = document.getElementById('codeView');
    const loadCodeBtn = document.getElementById('loadCodeBtn');
    const downloadCodeBtn = document.getElementById('downloadCodeBtn');

    async function loadArduinoCode() {
        const inoPath = '../RC-Car-WiFi-wAxis/RC-Car-WiFi-wAxis.ino';
        try {
            const r = await fetch(inoPath);
            if (!r.ok) throw new Error('Fetch failed');
            const text = await r.text();
            codeView.textContent = text;
        } catch (err) {
            codeView.textContent = '// Unable to load Arduino source. Ensure the file exists at: ' + inoPath;
            console.error(err);
        }
    }

    if (loadCodeBtn) loadCodeBtn.addEventListener('click', loadArduinoCode);
    if (downloadCodeBtn) downloadCodeBtn.addEventListener('click', async () => {
        const inoPath = '../RC-Car-WiFi-wAxis/RC-Car-WiFi-wAxis.ino';
        try {
            const r = await fetch(inoPath);
            if (!r.ok) throw new Error('Fetch failed');
            const blob = await r.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'RC-Car-WiFi-wAxis.ino';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            alert('Could not download file. Ensure path is correct.');
        }
    });

    // init
    (async () => {
        const imgs = await tryLoadImagesFromFolder();
        populateCarousel(imgs);
    })();

})();