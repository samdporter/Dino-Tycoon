import sys, time, subprocess, urllib.request
from playwright.sync_api import sync_playwright
root=sys.argv[1]; port=8792
srv=subprocess.Popen([sys.executable, f"{root}/server.py","--port",str(port)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(50):
    try: urllib.request.urlopen(f"http://127.0.0.1:{port}/",timeout=0.2); break
    except Exception: time.sleep(0.1)
FPS="new Promise(r=>{let n=0,s=performance.now();function f(){if(++n<10)requestAnimationFrame(f);else r(10000/(performance.now()-s))}requestAnimationFrame(f)})"
with sync_playwright() as p:
    import json
    flagsets={"swiftshader":["--no-sandbox","--enable-unsafe-swiftshader"],"angle-gl":["--no-sandbox","--use-angle=gl"],"angle-gl-egl":["--no-sandbox","--use-gl=angle","--use-angle=gl-egl"],"angle-vulkan":["--no-sandbox","--use-angle=vulkan","--enable-features=Vulkan"],"egl":["--no-sandbox","--use-gl=egl"]}
    GL="(()=>{const c=document.createElement('canvas').getContext('webgl');const d=c&&c.getExtension('WEBGL_debug_renderer_info');return d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):String(!!c)})()"
    for name,args in flagsets.items():
      for page in ["zoo.html"]:
        try:
          b=p.chromium.launch(headless=True,args=args); pg=b.new_page(viewport={"width":1280,"height":900})
          t=time.time(); pg.goto(f"http://127.0.0.1:{port}/{page}"); pg.wait_for_function("window.Z && Z.Main && !document.querySelector('#boot:not(.gone)')",timeout=120000)
          print(name, "gl=", pg.evaluate(GL), "boot", round(time.time()-t,1), "fps", round(pg.evaluate(FPS),2), flush=True); b.close()
        except Exception as e: print(name, "ERR", str(e)[:200], flush=True)
    for page in []:
        b=None; pg=None
        pg.goto(f"http://127.0.0.1:{port}/{page}"); pg.wait_for_function("window.Z && Z.Main && !document.querySelector('#boot:not(.gone)')",timeout=120000)
srv.terminate()
