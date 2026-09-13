import bpy,json,os,glob,traceback
OUT='/Users/happy/Desktop/AdgaiWalker/output/xiaoying/yingyao-v2'
s=bpy.context.scene
def status(data):
    with open(OUT+'/motion-render-status.json','w') as f:json.dump(data,f)
def progress(scene,*args):status({'state':'rendering','frame':scene.frame_current,'end':scene.frame_end})
def render_movie():
    previous={'engine':s.render.engine,'format':s.render.image_settings.file_format,'percent':s.render.resolution_percentage,'fps':s.render.fps,'step':s.frame_step,'path':s.render.filepath}
    try:
        s.render.engine='BLENDER_WORKBENCH'
        sh=s.display.shading;sh.light='STUDIO';sh.color_type='MATERIAL';sh.show_shadows=True;sh.show_cavity=True;sh.cavity_type='BOTH';sh.background_type='WORLD'
        s.world.color=(.75,.71,.64)
        s.render.resolution_percentage=50;s.render.fps=12;s.frame_step=2
        s.render.image_settings.media_type='VIDEO';s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='MEDIUM';s.render.ffmpeg.ffmpeg_preset='REALTIME'
        s.render.filepath=OUT+'/yingyao-motion-preview'
        bpy.app.handlers.render_write.append(progress)
        status({'state':'rendering','frame':1,'end':696})
        bpy.ops.render.render(animation=True)
        files=glob.glob(OUT+'/yingyao-motion-preview*.mp4')
        if not files:raise RuntimeError('Render completed without an MP4 output')
        path=max(files,key=os.path.getmtime);dest=OUT+'/yingyao-motion-preview.mp4'
        if path!=dest:os.replace(path,dest)
        status({'state':'complete','file':dest,'bytes':os.path.getsize(dest),'fps':12,'duration_seconds':29})
    except Exception:
        status({'state':'error','error':traceback.format_exc()})
    finally:
        if progress in bpy.app.handlers.render_write:bpy.app.handlers.render_write.remove(progress)
        s.render.engine=previous['engine'];s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format=previous['format'];s.render.resolution_percentage=previous['percent'];s.render.fps=previous['fps'];s.frame_step=previous['step'];s.render.filepath=previous['path'];s.frame_set(1)
        bpy.ops.wm.save_as_mainfile(filepath=OUT+'/xiaoying-yingyao-v2.blend')
    return None
bpy.app.timers.register(render_movie,first_interval=.3)
result={'queued':'29-second workbench motion preview','output':OUT}
