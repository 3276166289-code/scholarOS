const FileDrop=(()=>{
  const isFiles=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  function bind(host,{label='Release to upload',onFiles,onError=uiNotify,busy=()=>false}){
    let depth=0;host.dataset.dropLabel=label;
    host.addEventListener('dragenter',event=>{if(!isFiles(event))return;event.preventDefault();depth++;host.classList.add('file-drop-active');});
    host.addEventListener('dragover',event=>{if(!isFiles(event))return;event.preventDefault();event.dataTransfer.dropEffect=busy()?'none':'copy';});
    host.addEventListener('dragleave',event=>{if(!isFiles(event))return;if(--depth<=0){depth=0;host.classList.remove('file-drop-active');}});
    host.addEventListener('drop',async event=>{
      if(!isFiles(event))return;event.preventDefault();event.stopPropagation();depth=0;host.classList.remove('file-drop-active');
      if(busy())return onError('Busy processing, upload when it finishes');
      if([...(event.dataTransfer.items||[])].some(item=>item.webkitGetAsEntry?.()?.isDirectory))return onError('Folders cannot be dropped; pick a file inside');
      const files=[...event.dataTransfer.files];if(!files.length)return;
      if(files.length>20)return onError('Up to 20 files per batch');
      try{await onFiles(files,event);}catch(error){onError(error.message||'Upload failed');}
    });
  }
  function image(file){return /\.(png|jpe?g|webp|tiff?)$/i.test(file.name);}
  function dataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Read file failed:'+file.name));reader.readAsDataURL(file);});}
  function project(file,projectId,onProgress=()=>{}){
    if(file.size>50*1024*1024)return Promise.reject(new Error(file.name+'over 50 MB'));
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('POST','/api/project/files/upload?'+new URLSearchParams({project_id:projectId,name:file.name}));xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.timeout=120000;
      xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(event.loaded/event.total*100));};
      xhr.onerror=()=>reject(new Error('Network interrupted:'+file.name));xhr.ontimeout=()=>reject(new Error('Upload timed out:'+file.name));
      xhr.onload=()=>{try{const result=JSON.parse(xhr.responseText);if(xhr.status>=400)throw new Error(result.error||'Upload failed');resolve(result);}catch(error){reject(error);}};
      xhr.send(file);
    });
  }
  for(const type of ['dragover','drop'])document.addEventListener(type,event=>{if(isFiles(event))event.preventDefault();});
  return {bind,image,dataURL,project};
})();
