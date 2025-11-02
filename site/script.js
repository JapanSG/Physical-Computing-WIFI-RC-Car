/*
  script.js
  - populates gallery from /site/images (tries to parse folder listing; falls back to user-provided list)
  - loads Arduino .ino file from ../RC-Car-WiFi-wAxis/RC-Car-WiFi-wAxis.ino
  - provides button & keyboard control that sends requests to a configurable controller URL
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
        mobileOverlay.classList.add('show');   // use class to control visibility
        mobileOverlay.hidden = false;          // keep DOM attribute in sync
        // prevent body scroll when open
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
                    // if it's an absolute URL, keep it
                    if (/^https?:\/\//i.test(l)) return l;
                    // otherwise extract filename to avoid duplicated path segments like "images/images/..."
                    const parts = l.split('/').filter(Boolean);
                    const filename = parts[parts.length - 1];
                    return 'images/' + filename;
                });
            }
        } catch (e) {
            // ignore and fall back
        }
        // fallback: use explicit filenames (if any)
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

    // Controls & keyboard
    const controlButtons = document.querySelectorAll('.control-btn');
    let controllerBase = ''; // user-specified URL
    const controllerInput = document.getElementById('controllerUrl');
    controllerInput.addEventListener('change', () => {
        controllerBase = controllerInput.value.trim().replace(/\/+$/, '');
        localStorage.setItem('rc_controller_base', controllerBase);
    });
    // load saved
    controllerBase = localStorage.getItem('rc_controller_base') || '';
    controllerInput.value = controllerBase;

    function setBtnActive(btn) {
        controlButtons.forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
    }

    async function sendCommand(cmd) {
        // cmd: forward/back/left/right/stop
        console.log('sendCommand', cmd);
        setBtnActive(
            Array.from(controlButtons).find(b => b.dataset.cmd === cmd)
        );
        if (!controllerBase) {
            console.warn('Controller URL not set. Set it in the input field to enable network control.');
            return;
        }
        // example: controller supports GET ?cmd=forward or endpoints /forward
        const tryUrls = [
            `${controllerBase}?cmd=${encodeURIComponent(cmd)}`,
            `${controllerBase}/${encodeURIComponent(cmd)}`,
        ];
        for (const url of tryUrls) {
            try {
                await fetch(url, { method: 'GET' });
                return;
            } catch (e) {
                // try next
            }
        }
    }

    controlButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const cmd = btn.dataset.cmd;
            await sendCommand(cmd);
        });
    });

    // keyboard handling
    const keyMap = {
        'w': 'forward', 'ArrowUp': 'forward',
        's': 'back', 'ArrowDown': 'back',
        'a': 'left', 'ArrowLeft': 'left',
        'd': 'right', 'ArrowRight': 'right',
        ' ': 'stop'
    };
    window.addEventListener('keydown', (e) => {
        const key = e.key;
        const cmd = keyMap[key];
        if (cmd) {
            e.preventDefault();
            sendCommand(cmd);
        }
    });

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

    loadCodeBtn.addEventListener('click', loadArduinoCode);
    downloadCodeBtn.addEventListener('click', async () => {
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