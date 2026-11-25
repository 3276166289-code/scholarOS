/* Local Mermaid preview and pixel-sized exports share the toolbox draft. */
const MermaidTool=(()=>{
  const samples={
    flow:'flowchart LR\n  A["Research question"] --> B["Literature search"]\n  B --> C["Evidence gathering"]\n  C --> D{"Manual review"}\n  D -->|Pass| E["Manuscript drafting"]\n  D -->|Change| C',
    sequence:'sequenceDiagram\n  participant U as research\n  participant A as expert\n  participant L as Library\n  U->>A: State a research goal\n  A->>L: Search the literature\n  L-->>A: Back to evidence\n  A-->>U: Submit the review\n  U->>A: Review and feedback',
    gantt:'gantt\n  title Research progress plan\n  dateFormat YYYY-MM-DD\n  section Literature study\n  Literature search :a, 2026-11-01, 7d\n  Evidence comparison :b, after a, 5d\n  section Writing and submission\n  First draft :c, after b, 10d\n  Peer checking :d, after c, 4d'
  };
  let libraryPromise=null,renderQueue=Promise.resolve();
  function library(){
    if(window.mermaid)return Promise.resolve(window.mermaid);
    if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='/vendor/mermaid/mermaid.min.js';
      script.onload=()=>window.mermaid?resolve(window.mermaid):reject(new Error('Diagram engine failed to load'));
      script.onerror=()=>reject(new Error('Figure engine failed to load. Reopen the toolbox'));document.head.append(script);
    }).catch(error=>{libraryPromise=null;throw error;});return libraryPromise;
  }
  function read(){try{return JSON.parse(localStorage.getItem('rw-mermaid-tool'))||{};}catch{return {};}}
  function sanitize(value){
    const cleaned=DOMPurify.sanitize(value,{USE_PROFILES:{svg:true,svgFilters:true},ADD_TAGS:['style'],FORBID_TAGS:['foreignObject','script','image','iframe','object','embed','a']});
    const documentSvg=new DOMParser().parseFromString(cleaned,'image/svg+xml'),root=documentSvg.documentElement;
    if(root.localName!=='svg'||documentSvg.querySelector('parsererror'))throw new Error('Generated diagram SVG is invalid');
    const localUrls=text=>text.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,quote,url)=>url.trim().startsWith('#')?'url('+url.trim()+')':'none').replace(/@import[^;]+;/gi,'');
    for(const node of [root,...root.querySelectorAll('*')]){
      for(const attr of [...node.attributes]){
        if(/^on/i.test(attr.name))node.removeAttribute(attr.name);
        else if(/(?:^|:)href$|^src$/i.test(attr.name)&&!attr.value.startsWith('#'))node.removeAttribute(attr.name);
        else if(/url\(/i.test(attr.value))node.setAttribute(attr.name,localUrls(attr.value));
      }
      if(node.localName==='style')node.textContent=localUrls(node.textContent);
    }
    const box=root.viewBox.baseVal,width=box.width||parseFloat(root.getAttribute('width')),height=box.height||parseFloat(root.getAttribute('height'));
    if(!(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)))throw new Error('Cannot determine figure size');
    root.setAttribute('xmlns','http://www.w3.org/2000/svg');root.setAttribute('width',String(width));root.setAttribute('height',String(height));root.style.maxWidth='none';root.style.background='transparent';
    return {root,width,height};
  }
  function mount(host){
    const saved=read(),state={code:saved.code||samples.flow,theme:['default','neutral','dark','forest'].includes(saved.theme)?saved.theme:'neutral',background:saved.background==='transparent'?'transparent':'theme',width:Number(saved.width)||3200,filename:saved.filename||'Research flow',zoom:saved.zoom||'fit'};
    let sequence=0,timer=null,diagram=null,imageUrl='',disposed=false,rendering=false;
    const h=value=>esc(String(value??''));
    host.className='mermaid-tool';host.innerHTML=`<div class="mmt-toolbar"><label>Chart theme<select class="control" data-mm-theme aria-label="Chart theme"><option value="neutral">Paper grayscale</option><option value="default">Classic palette</option><option value="forest">Forest green</option><option value="dark">Dark</option></select></label><label>Background<select class="control" data-mm-background aria-label="Chart background"><option value="theme">Follow theme</option><option value="transparent">Transparent</option></select></label><label>Insert example<select class="control" data-mm-example aria-label="Mermaid Example"><option value="">Choose a chart example</option><option value="flow">Research flow chart</option><option value="sequence">Collaboration timeline</option><option value="gantt">Research Gantt chart</option></select></label><button type="button" class="btn ghost" data-mm-render>Update preview</button></div><div class="mmt-workspace"><label class="mmt-code-label">Mermaid Source<textarea class="control" data-mm-code aria-label="Mermaid Source" rows="17" spellcheck="false">${h(state.code)}</textarea></label><section class="mmt-preview"><div class="mmt-preview-head"><span>Chart preview</span><label>Zoom<select class="control" data-mm-zoom aria-label="Preview zoom"><option value="fit">Fit window</option><option value="0.5">50%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label></div><div class="mmt-viewport" data-mm-viewport><p class="hint" data-mm-empty>Preparing the preview...</p><img data-mm-image alt="Mermaid Chart preview" hidden></div></section></div><div class="mmt-export"><label>File name<input class="control" data-mm-filename aria-label="Chart filename" maxlength="100" value="${h(state.filename)}"></label><label>PNG Width (pixels)<input class="control" data-mm-width aria-label="PNG Export width" type="number" min="320" max="16000" step="1" value="${h(state.width)}"></label><span class="hint" data-mm-size></span><button type="button" class="btn ghost" data-mm-svg disabled>Export SVG</button><button type="button" class="btn" data-mm-png disabled>Export HD PNG</button></div><p class="pw-error" data-mm-error role="alert"></p><p class="hint" data-mm-status role="status"></p>`;
    const el=name=>host.querySelector('[data-mm-'+name+']');
    const persist=()=>{try{localStorage.setItem('rw-mermaid-tool',JSON.stringify(state));}catch{}};
    function fail(error){el('error').textContent=error.message||String(error);}
    function background(){return state.background==='transparent'?null:state.theme==='dark'?'#1f2937':'#ffffff';}
    function svg(){
      if(!diagram)throw new Error('Generate a valid diagram preview first');
      const root=diagram.root.cloneNode(true),color=background();
      if(color){const rect=root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','rect');const box=root.viewBox.baseVal;for(const [key,value] of Object.entries({x:box.x,y:box.y,width:diagram.width,height:diagram.height,fill:color}))rect.setAttribute(key,String(value));root.insertBefore(rect,root.firstChild);}
      return new XMLSerializer().serializeToString(root);
    }
    function size(){
      const width=Number(state.width),height=diagram?Math.round(width*diagram.height/diagram.width):0;
      if(!Number.isInteger(width)||width<320||width>16000)throw new Error('PNG width must be an integer from 320 to 16000');
      if(height>16000||width*height>40000000)throw new Error('The figure export is too large. Reduce the PNG width');
      return {width,height:Math.max(1,height)};
    }
    function paintSize(){if(!diagram){el('size').textContent='';return;}try{const dimensions=size();el('size').textContent=dimensions.width+' × '+dimensions.height+' px';}catch(error){el('size').textContent=error.message;}}
    function fit(){if(!diagram)return;el('image').style.width=(state.zoom==='fit'?Math.min(diagram.width,Math.max(1,el('viewport').clientWidth-32)):diagram.width*Number(state.zoom))+'px';}
    function clear(){diagram=null;el('image').hidden=true;el('empty').hidden=false;el('svg').disabled=el('png').disabled=true;paintSize();if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl='';}}
    function schedule(){persist();++sequence;clearTimeout(timer);clear();el('empty').textContent='Waiting for preview update...';el('error').textContent='';timer=setTimeout(render,400);}
    async function render(){
      clearTimeout(timer);const ticket=++sequence,code=el('code').value.trim().replace(/^```(?:mermaid)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i,'$1').trim();state.code=el('code').value;persist();clear();el('error').textContent='';
      if(!code){el('empty').textContent='Paste Mermaid code to start the preview';el('status').textContent='';return;}
      if(code.length>200000){fail(new Error('Diagram code cannot exceed 200000 characters'));return;}
      rendering=true;el('empty').textContent='Rendering figure...';el('status').textContent='Updating preview...';
      const operation=async()=>{
        if(disposed||ticket!==sequence||!host.isConnected)return;
        const engine=await library(),stage=document.createElement('div');stage.className='mmt-stage';document.body.append(stage);
        try{
          engine.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,theme:state.theme,fontFamily:'Microsoft YaHei, Segoe UI, Arial, sans-serif',maxTextSize:200000,maxEdges:1000,arrowMarkerAbsolute:false,
            secure:['secure','securityLevel','startOnLoad','htmlLabels','flowchart','themeCSS','theme','themeVariables','fontFamily','maxTextSize','maxEdges'],flowchart:{htmlLabels:false,useMaxWidth:false}});
          const rendered=await engine.render('mm_'+crypto.randomUUID().replaceAll('-',''),code,stage);
          if(disposed||ticket!==sequence||!host.isConnected)return;
          diagram=sanitize(rendered.svg);imageUrl=URL.createObjectURL(new Blob([svg()],{type:'image/svg+xml;charset=utf-8'}));
          el('image').src=imageUrl;el('image').hidden=false;el('empty').hidden=true;el('svg').disabled=el('png').disabled=false;fit();paintSize();el('status').textContent='Preview updated · code and settings auto-saved locally';
        }finally{stage.remove();}
      };
      const pending=renderQueue.then(operation);renderQueue=pending.catch(()=>{});
      try{await pending;}catch(error){if(!disposed&&ticket===sequence){clear();el('empty').textContent='Fix the code, then preview again';fail(new Error(String(error.message||error).replace(/<[^>]+>/g,'').slice(0,1200)));el('status').textContent='Figure not generated, export is unavailable';}}finally{if(ticket===sequence)rendering=false;}
    }
    const download=(blob,extension)=>exportBlob(blob,(state.filename.trim()||'Research flow')+'.'+extension);
    el('theme').value=state.theme;el('background').value=state.background;el('zoom').value=state.zoom;
    el('code').oninput=()=>{state.code=el('code').value;schedule();};el('render').onclick=render;
    for(const field of ['theme','background'])el(field).onchange=()=>{state[field]=el(field).value;schedule();};
    el('zoom').onchange=()=>{state.zoom=el('zoom').value;persist();fit();};
    el('width').oninput=()=>{state.width=el('width').value;persist();paintSize();};el('filename').oninput=()=>{state.filename=el('filename').value;persist();};
    el('example').onchange=async()=>{const key=el('example').value;el('example').value='';if(!samples[key])return;if(state.code.trim()&&!Object.values(samples).includes(state.code)&&!await uiConfirm('Replace the current Mermaid code with the example?',{ok:'Replace code',cancel:'Keep current code',danger:true}))return;state.code=samples[key];el('code').value=state.code;schedule();};
    el('svg').onclick=async()=>{try{if(rendering)return;const message=await download(new Blob([svg()],{type:'image/svg+xml;charset=utf-8'}),'svg');if(message)el('status').textContent=message;}catch(error){fail(error);}};
    el('png').onclick=async()=>{
      if(rendering||!diagram)return;const button=el('png');button.disabled=true;el('error').textContent='';let url='';
      try{const dimensions=size(),source=svg(),image=new Image();url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));image.src=url;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;const context=canvas.getContext('2d');if(!context)throw new Error('Cannot create image canvas');
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG export failed; reduce the export width');const message=await download(blob,'png');if(message)el('status').textContent=message+' · '+dimensions.width+' × '+dimensions.height+' px';
      }catch(error){fail(error);}finally{if(url)URL.revokeObjectURL(url);if(!disposed)button.disabled=!diagram;}
    };
    const observer=new ResizeObserver(fit);observer.observe(el('viewport'));render();
    return {focus:()=>el('code').focus({preventScroll:true}),importCode(code,name){
      state.code=code;state.filename=name.replace(/\.[^.]+$/,'');el('code').value=code;el('filename').value=state.filename;schedule();
    },destroy(){disposed=true;++sequence;clearTimeout(timer);observer.disconnect();if(imageUrl)URL.revokeObjectURL(imageUrl);}};
  }
  return {mount};
})();
