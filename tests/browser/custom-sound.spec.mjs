import {test,expect} from './fixtures.mjs';
import {control,importNotes} from './helpers.mjs';

async function openCustom(page){
  await control(page,'sound-open').click();
  await page.locator('[data-settings-panel=audio]').click();
  await expect(control(page,'custom-start')).toBeEnabled();
}
async function seedOldRecordings(page){
  await page.goto('/source-sounds.js');
  await page.evaluate(async()=>{
    const database=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('osm-custom-sounds-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('notes',{keyPath:'pitch'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const transaction=database.transaction('notes','readwrite');
      for(let pitch=69;pitch<=89;pitch++){
        const rate=16000,pcm=Float32Array.from({length:rate*3},(_,i)=>.2*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*i/rate));
        transaction.objectStore('notes').put({pitch,rate,pcm,cents:0});
      }
      transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
    });
    database.close();
  });
}

test('custom recording resets on wrong pitch and advances automatically with one microphone request',async({page})=>{
  test.setTimeout(45000);
  await page.addInitScript(()=>{
    Object.defineProperty(MediaDevices.prototype,'getUserMedia',{configurable:true,value:async()=>{
      window.customMicrophoneRequests=(window.customMicrophoneRequests??0)+1;
      const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=440;gain.gain.value=.2;
      oscillator.connect(gain).connect(destination);oscillator.start();
      window.setRecordedTestPitch=frequency=>{oscillator.frequency.value=frequency;};
      window.customMicrophoneTrack=destination.stream.getTracks()[0];
      await context.resume();
      return destination.stream;
    }});
  });
  await page.goto('/');
  await openCustom(page);
  await expect(control(page,'custom-fingering')).toHaveAttribute('aria-label','Fingering for A4');
  await expect(control(page,'custom-fingering').locator('svg')).toBeVisible();
  await control(page,'custom-start').click();
  await expect.poll(async()=>Number(await control(page,'custom-ring').getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(1);
  await page.evaluate(()=>window.setRecordedTestPitch(523.251));
  await expect(control(page,'custom-ring')).toHaveAttribute('aria-valuenow','0.0');
  await expect(control(page,'custom-notes').getByRole('button',{name:'A4, recorded',exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.setRecordedTestPitch(440));
  await expect(control(page,'custom-notes').getByRole('button',{name:'A4, recorded',exact:true})).toBeVisible({timeout:12000});
  await expect(control(page,'custom-count')).toHaveText('1 / 21 notes recorded');
  await expect(control(page,'custom-next')).toHaveCount(0);
  expect(await page.evaluate(()=>window.customMicrophoneTrack.readyState)).toBe('live');
  await expect(control(page,'custom-target')).toHaveText('A♯4');
  await expect(control(page,'custom-fingering')).toHaveAttribute('aria-label','Fingering for A♯4');
  await page.evaluate(()=>window.setRecordedTestPitch(466.163762));
  await expect(control(page,'custom-notes').getByRole('button',{name:'A♯4, recorded',exact:true})).toBeVisible({timeout:12000});
  await expect(control(page,'custom-count')).toHaveText('2 / 21 notes recorded');
  expect(await page.evaluate(()=>window.customMicrophoneRequests)).toBe(1);
  await expect(control(page,'custom-target')).toHaveText('B4');
  expect(await page.evaluate(()=>window.customMicrophoneRequests)).toBe(1);
  await control(page,'custom-stop').click();
  expect(await page.evaluate(()=>window.customMicrophoneTrack.readyState)).toBe('ended');
  await expect(control(page,'custom-use')).toBeDisabled();
  await control(page,'custom-notes').getByRole('button',{name:'A4, recorded',exact:true}).click();
  await expect(control(page,'custom-hear')).toBeEnabled();
  await control(page,'custom-hear').click();
  await expect(control(page,'now')).toHaveText('A4');
  await page.reload();await openCustom(page);
  await expect(control(page,'custom-count')).toHaveText('2 / 21 notes recorded');
});
test('complete recorded profiles replace presets for note previews and score playback',async({page})=>{
  await seedOldRecordings(page);
  await page.goto('/');await openCustom(page);
  await expect(control(page,'custom-use')).toBeEnabled();
  await control(page,'custom-use').click();
  await page.locator('[data-settings-panel=audio]').click();
  await expect(page.locator('input[name=osm-sound][value=custom]')).toBeChecked();
  await control(page,'sound-done').click();
  await page.addInitScript(()=>{
    const original=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){window.lastRecordedRate=this.buffer.sampleRate;return original.apply(this,args);};
  });
  await importNotes(page,'A4 C5 F6');
  await control(page,'play').click();
  await expect.poll(()=>page.evaluate(()=>window.lastRecordedRate)).toBe(16000);
  await control(page,'stop').click();
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('osm-ocarina-sound'))).toBe('custom');
});

test('offline recording uses the same tuner hold and stops when Settings closes',async({page})=>{
  const {pathToFileURL}=await import('node:url');
  const {resolve}=await import('node:path');
  await page.addInitScript(()=>{
    Object.defineProperty(MediaDevices.prototype,'getUserMedia',{configurable:true,value:async()=>{
      const context=new AudioContext(),oscillator=context.createOscillator(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=440;oscillator.connect(destination);oscillator.start();await context.resume();
      window.recordedTestTrack=destination.stream.getTracks()[0];
      return destination.stream;
    }});
  });
  await page.goto(pathToFileURL(resolve('osm-offline.html')).href);
  await openCustom(page);await control(page,'custom-start').click();
  await expect.poll(async()=>Number(await control(page,'custom-ring').getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(.7);
  await control(page,'sound-done').click();
  await expect.poll(()=>page.evaluate(()=>window.recordedTestTrack.readyState)).toBe('ended');
});

async function mockCustomMicrophone(page){
  await page.addInitScript(()=>{
    Object.defineProperty(MediaDevices.prototype,'getUserMedia',{configurable:true,value:async()=>{
      window.customMicrophoneRequests=(window.customMicrophoneRequests??0)+1;
      const context=new AudioContext(),oscillator=context.createOscillator(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=440;oscillator.connect(destination);oscillator.start();await context.resume();
      window.setRecordedTestPitch=frequency=>{oscillator.frequency.value=frequency;};
      window.customMicrophoneTrack=destination.stream.getTracks()[0];
      return destination.stream;
    }});
  });
}
test('Record again continues through already-recorded notes without reopening the microphone',async({page})=>{
  await mockCustomMicrophone(page);await seedOldRecordings(page);
  await page.goto('/');await openCustom(page);
  await expect(control(page,'custom-count')).toHaveText('21 / 21 notes recorded');
  await control(page,'custom-start').click();
  await expect(control(page,'custom-target')).toHaveText('A♯4',{timeout:12000});
  expect(await page.evaluate(()=>window.customMicrophoneTrack.readyState)).toBe('live');
  await page.evaluate(()=>window.setRecordedTestPitch(466.163762));
  await expect(control(page,'custom-target')).toHaveText('B4',{timeout:12000});
  expect(await page.evaluate(()=>window.customMicrophoneRequests)).toBe(1);
  await control(page,'custom-stop').click();
  expect(await page.evaluate(()=>window.customMicrophoneTrack.readyState)).toBe('ended');
});
test('named custom sounds can be saved, copied, restored, and deleted without changing other saved sounds',async({page})=>{
  await seedOldRecordings(page);await page.goto('/');await openCustom(page);
  await control(page,'custom-name').fill('Alto ocarina');
  await control(page,'custom-save').click();
  await expect(control(page,'custom-status')).toHaveText('Sound saved.');
  const original=await control(page,'custom-library').inputValue();
  await control(page,'custom-name').fill('Second ocarina');
  await control(page,'custom-copy').click();
  await expect(control(page,'custom-status')).toHaveText('New sound saved.');
  const copy=await control(page,'custom-library').inputValue();expect(copy).not.toBe(original);
  await control(page,'custom-new').click();
  await expect(control(page,'custom-count')).toHaveText('0 / 21 notes recorded');
  await expect(control(page,'custom-library').locator('option')).toHaveCount(3);
  await control(page,'custom-library').selectOption(original);
  await expect(control(page,'custom-name')).toHaveValue('Alto ocarina');
  await expect(control(page,'custom-count')).toHaveText('21 / 21 notes recorded');
  await control(page,'custom-use').click();
  await page.reload();await openCustom(page);
  await expect(control(page,'custom-library')).toHaveValue(original);
  await expect(page.locator('input[name=osm-sound][value=custom]')).toBeChecked();
  // Rejecting deletion must preserve both the saved profile and the playable draft.
  page.once('dialog',dialog=>dialog.dismiss());
  await control(page,'custom-delete').click();
  await expect(control(page,'custom-library').locator('option')).toHaveCount(3);
  await control(page,'custom-library').selectOption(copy);
  page.once('dialog',dialog=>dialog.accept());
  await control(page,'custom-delete').click();
  await expect(control(page,'custom-status')).toHaveText('Saved sound deleted.');
  await expect(control(page,'custom-count')).toHaveText('0 / 21 notes recorded');
  await expect(page.locator('input[name=osm-sound][value=oc2]')).toBeChecked();
  await expect(control(page,'custom-library').locator('option')).toHaveCount(2);
  await control(page,'custom-library').selectOption(original);
  await expect(control(page,'custom-name')).toHaveValue('Alto ocarina');
  await expect(control(page,'custom-count')).toHaveText('21 / 21 notes recorded');
  await page.reload();await openCustom(page);
  await expect(control(page,'custom-library').locator('option')).toHaveCount(2);
  await expect(control(page,'custom-library')).toHaveValue(original);
});
test('unsaved takes are protected when starting a different custom sound',async({page})=>{
  await seedOldRecordings(page);await page.goto('/');await openCustom(page);
  page.once('dialog',dialog=>dialog.dismiss());await control(page,'custom-new').click();
  await expect(control(page,'custom-count')).toHaveText('21 / 21 notes recorded');
  await control(page,'custom-name').fill('Keep this take');await control(page,'custom-save').click();
  await expect(control(page,'custom-status')).toHaveText('Sound saved.');
  await control(page,'custom-new').click();
  await expect(control(page,'custom-count')).toHaveText('0 / 21 notes recorded');
  await expect(control(page,'custom-library').locator('option')).toHaveCount(2);
});
