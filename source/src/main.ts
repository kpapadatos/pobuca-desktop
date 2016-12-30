import * as gui from 'nw.gui';
import { EventEmitter2 } from 'eventemitter2';

async function main() {

    console.log('Initialized!');

    gui.Screen.Init();

    //  gui.Window.get().showDevTools();

    let mainScreen = gui.Screen.screens.filter(s => !s.bounds.x && !s.bounds.y)[0];
    let toastManager = global['toastManager'] = new ToastManager(mainScreen.work_area);

    // toastManager.spawnToast({ text: 'Initializing Victor...' });

    var menu = new gui.Menu();
    var submenu = new gui.Menu();

    submenu.append(new gui.MenuItem({ type: 'checkbox', checked: true, label: 'Window' }));
    submenu.append(new gui.MenuItem({ type: 'checkbox', label: 'Popup' }));

    var submenuItem = new gui.MenuItem({ label: 'Display mode', submenu });
    var reloadItem = new gui.MenuItem({ type: 'normal', label: 'Reload (dev)' });
    var exitItem = new gui.MenuItem({ type: 'normal', label: 'Exit' });

    exitItem.click = () => {
        tray.remove();
        tray = null;
        process.exit(0);
    };

    menu.append(submenuItem);
    menu.append(new gui.MenuItem({ type: 'separator' }));
    menu.append(reloadItem);
    menu.append(exitItem);

    let tray = new gui.Tray({ tooltip: 'Pobuca', icon: 'assets/logo.png', menu });

    let resolveAppWindow;
    let appWindowPromise = new Promise(r => resolveAppWindow = r);

    gui.Window.open('dist/index.html', {
        title: 'Pobuca',
        position: 'center',
        width: 370,
        height: 500,
        transparent: false,
        frame: true,
        always_on_top: false,
        show: false,
        resizable: true,
        new_instance: true,
        icon: 'assets/logo.png'
    }, win => {
        // win.showDevTools();

        win['outerWindow'].window.onmessage = function(msg) {
            console.log(msg);
            let href = JSON.parse(msg.data).href;
            require('nw.gui').Shell.openExternal(href);
        }

        win.on('close', function() {
            win[(appWindowVisible = false) ? 'show' : 'hide']();
        });

        resolveAppWindow(win);

    });

    let appWindowVisible = false;
    tray.on('click', () => {
        appWindowPromise.then((win: any) => {
            win[(appWindowVisible = !appWindowVisible) ? 'show' : 'hide']();
            appWindowVisible && win.focus();
        });
    });

    let victor = new Victor(toastManager);
    // victor.speak(victor.INITIAL_GREET);

    // tray.on('click', () => victor.speak(victor.INITIAL_GREET));

    global['victor'] = victor;
    global['tray'] = tray;

}

class Victor extends EventEmitter2 {

    private toastManager: ToastManager;

    constructor(toastManager: ToastManager) {
        super();
        this.toastManager = toastManager;
    }

    speak(text) {
        let utterance = new global['SpeechSynthesisUtterance']();
        utterance.text = text;
        global['speechSynthesis'].speak(utterance);
        this.toastManager.spawnToast({
            text: `<span style="color:cyan">${text}</span>`
        });
    }

    get INITIAL_GREET() {
        let quotes = [
            'Hello there!',
            'Victor operational.',
            'Victor engaged.',
            'Victor is here.',
            'Hello.',
            'Hi.',
            'It\'s good to be back.'
        ];
        return quotes[~~(Math.random() * quotes.length)];
    }

}

class Toast extends EventEmitter2 {

    window: any;
    anchor: { x?: number, y?: number } = {};
    animationTimeout: NodeJS.Timer;

    constructor(options) {

        super();

        let longevity = 6e3;
        let [width, height] = [400, 50];
        let [x, y] = [options.anchor.x - width, options.anchor.y - height];

        this.anchor.y = y;

        gui.Window.open('./dist/templates/notification.html', {
            position: 'center',
            width,
            height,
            transparent: true,
            frame: false,
            always_on_top: true,
            show: false,
            resizable: false,
            new_instance: true
        }, win => {

            [win.x, win.y] = [~~x, ~~y];
            win.setShowInTaskbar(false);

            let toastWindow = win['outerWindow'].window;

            this.window = win;
            this.emit('gotWindow');

            toastWindow.onload = () => {
                toastWindow.$('.text').html(options.text);
                win.show();
                setTimeout(() => {

                    this.emit('spawned');

                    let widthOffset = 50;
                    let heightOffset = 30;
                    let newWidth = ~~toastWindow.$('.content').width() + widthOffset;
                    let newHeight = ~~toastWindow.$('.content').height() + heightOffset;

                    // Windows hack
                    newWidth < 126 && (newWidth = 126);
                    newHeight < 50 && (newHeight = 50);

                    this.width = newWidth;
                    win.x = options.anchor.x - newWidth;
                    this.x = options.anchor.x - newWidth;

                    this.height = newHeight;
                    win.y = options.anchor.y - newHeight;
                    this.y = options.anchor.y - newHeight;

                    console.log(newHeight);

                }, 100);
            };

        });

    }

    get width() { return this.window.width; }
    get height() { return this.window.height; }
    set width(value) { this.window.width = ~~value; this.emit('widthChanged', value); }
    set height(value) { this.window.height = ~~value; this.emit('heightChanged', value); }

    dismiss() {
        this.window['outerWindow'].window.$('.content').css({
            animation: 'spawn .5s reverse',
            opacity: 0
        });
        setTimeout(() => this.emit('dismiss'), 200);
    }

    get y() { return this.anchor.y; }
    get x() { return this.anchor.x; }
    set y(value) { this.anchor.y = ~~value; this.animateToAnchor(); }
    set x(value) { this.anchor.x = ~~value; this.animateToAnchor(); }

    animateToAnchor() {
        if (!this.window)
            return this.on('gotWindow', () => this.animateToAnchor());
        clearTimeout(this.animationTimeout);
        let toast = this;
        let window = this.window;
        let anchor = this.anchor;
        let duration = 200;
        let fps = 60;
        fps = (fps * (duration / 1e3));
        let initialX = window.x;
        let initialY = window.y;
        let pixelsX = anchor.x - window.x;
        let pixelsY = anchor.y - window.y;
        (function animate() {
            let animateMore = false;
            window.y += ~~(pixelsY / fps);

            if (initialY > anchor.y ? window.y > anchor.y : window.y < anchor.y)
                animateMore = true;
            else
                window.y = initialY + pixelsY;

            if (initialX > anchor.x ? window.x > anchor.x : window.x < anchor.x)
                animateMore = true;
            else
                window.x = initialX + pixelsX;

            if (animateMore)
                toast.animationTimeout = setTimeout(animate, duration / fps);
        })();
    }

}

class ToastManager extends EventEmitter2 {

    private toasts: Toast[] = [];
    private bottomRightAnchor: any;
    private TOAST_SPAWNING: boolean = false;
    private spawnToastQueue: any[] = [];

    constructor(workArea) {

        super();

        // Margin of the toasts from work area bounds
        let offset = 20;

        this.bottomRightAnchor = {
            x: workArea.x + workArea.width - offset,
            y: workArea.y + workArea.height - offset
        };

        this.on('newToast', newToast => {
            newToast.on('gotWindow', () => {
                //  for (let toast of this.toasts.filter(t => t !== newToast))
                //   toast.y = toast.y - newToast.window.height;
            });
        });

    }

    spawnToast(options) {

        if (this.TOAST_SPAWNING)
            return this.spawnToastQueue.push(options);

        this.TOAST_SPAWNING = true;

        let newToast = new Toast({
            anchor: this.bottomRightAnchor,
            text: options.text
        });

        newToast.on('spawned', () => {
            this.TOAST_SPAWNING = false;
            if (this.spawnToastQueue.length)
                this.spawnToast(this.spawnToastQueue.shift());
        });

        this.toasts.push(newToast);
        this.emit('newToast', newToast);

        newToast.on('heightChanged', newHeight => {
            console.log('heightChanged', newHeight)
            for (let toast of this.toasts) {
                if (newToast === toast) break;
                toast.y = toast.y - newHeight;
            }
        });

    }

}

main();
