import sys, subprocess
from playwright.sync_api import sync_playwright
mode = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':1080,'height':1080})
    pg.goto('file:///home/claude/media/video/scene.html'); pg.wait_for_timeout(800)
    if mode == 'stills':
        for t in [3,10,17,24,30,36,45,57,64,72]:
            pg.evaluate(f'render({t})'); pg.screenshot(path=f'still-{t:02d}.png')
    else:
        fps=30; total=pg.evaluate('TOTAL'); n=int(total*fps)
        ff = subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate',str(fps),'-c:v','png','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium','-movflags','+faststart','typesafe-vs-jev-1080.mp4'], stdin=subprocess.PIPE)
        for i in range(n):
            pg.evaluate(f'render({i/fps})')
            ff.stdin.write(pg.screenshot(type='png'))
        ff.stdin.close(); ff.wait()
    b.close()
