(function(){
  'use strict';

  // ---------- Yardımcılar ----------
  const $ = s=>document.querySelector(s);
  const $$ = s=>Array.from(document.querySelectorAll(s));
  const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const shuffle = a=>{ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a };
  const norm = s=>s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const store = {
    get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d }catch(e){ return d } },
    set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)) }catch(e){} }
  };

  // ---------- Kalıcı durum ----------
  let known = store.get('bia-known',{});   // kart anahtarı → 1
  let wrong = store.get('bia-wrong',{});   // soru kimliği → yanlış sayısı
  let solved = store.get('bia-solved',{}); // soru kimliği → son cevap doğru mu
  let tests = store.get('bia-tests',[]);   // {t, s, n, ch}
  const saveProgress = ()=>{ store.set('bia-known',known); store.set('bia-wrong',wrong); store.set('bia-solved',solved); store.set('bia-tests',tests); updateWrongCount() };

  // ---------- Veri ----------
  const key = c=>c.ch+'|'+c.term;
  TF.forEach(t=>{ t.kind='tf'; t.id='tf|'+t.q });
  FILL.forEach(f=>{ f.kind='fill'; f.id='fill|'+f.s });
  OPEN.forEach(o=>{ o.kind='open' });
  const byCh = list=>list.filter(x=>!S.ch||x.ch===S.ch);
  const cardByKey = {}; CARDS.forEach(c=>{ cardByKey[key(c)]=c });
  const cardPool = ()=>byCh(CARDS).filter(c=>S.cardView==='known'?known[key(c)]:!known[key(c)]);

  function mcqItem(m){
    return {kind:'choice', id:'mcq|'+m.q, ch:m.ch, label:'Senaryo', q:m.q, opts:shuffle(m.opts), a:m.opts[m.a], why:m.why};
  }
  // Çeldiriciler veri sırasındaki yakın kartlardan seçilir; yakın kartlar aynı konudadır.
  function defItem(c){
    const same = CARDS.filter(x=>x.ch===c.ch);
    const at = same.indexOf(c);
    const near = same.filter(x=>x.term!==c.term)
      .map(x=>({x, d:Math.abs(same.indexOf(x)-at)+Math.random()*14}))
      .sort((p,q)=>p.d-q.d).slice(0,3).map(p=>p.x.term);
    return {kind:'choice', id:'def|'+key(c), ch:c.ch, label:'Bu tanım hangi kavrama ait?', q:c.def, opts:shuffle(near.concat(c.term)), a:c.term, why:c.ex, isDef:true};
  }
  function resolve(id){
    const cut = id.indexOf('|'), type = id.slice(0,cut), rest = id.slice(cut+1);
    if(type==='tf') return TF.find(t=>t.id===id);
    if(type==='fill') return FILL.find(f=>f.id===id);
    if(type==='mcq'){ const m=MCQ.find(x=>x.q===rest); return m&&mcqItem(m) }
    if(type==='def'){ const c=CARDS.find(x=>key(x)===rest); return c&&defItem(c) }
  }
  function buildTest(n){
    const mcq = shuffle(byCh(MCQ)), defs = shuffle(byCh(CARDS)), tf = shuffle(byCh(TF));
    const wantM = Math.min(mcq.length, Math.round(n*.4)), wantT = Math.min(tf.length, Math.round(n*.2));
    const wantD = Math.min(defs.length, n-wantM-wantT);
    return shuffle(mcq.slice(0,wantM).map(mcqItem).concat(defs.slice(0,wantD).map(defItem), tf.slice(0,wantT)));
  }

  // ---------- Oturum durumu ----------
  const S = {route:'ozet', ch:store.get('bia-ch',0), i:0, order:[], flipped:false, termFirst:false, cardView:'todo', lastKnown:null,
             score:{ok:0,no:0}, answered:false, log:[], testN:20, testPhase:'setup', started:0};
  const TITLES = {kartlar:'Kartlar','dogru-yanlis':'Doğru/Yanlış',bosluk:'Boşluk doldurma','acik-uclu':'Açık uçlu',test:'Test',hatalar:'Hatalarım',sozluk:'Sözlük',ozet:'Özet'};
  const ROUTE_SRC = {'dogru-yanlis':()=>TF, bosluk:()=>FILL, 'acik-uclu':()=>OPEN};

  function record(item, ok){
    if(!item.id) return;
    solved[item.id] = ok?1:0;
    if(ok) delete wrong[item.id]; else wrong[item.id] = (wrong[item.id]||0)+1;
    saveProgress();
  }
  function answer(item, ok, yours, right){
    ok?S.score.ok++:S.score.no++;
    S.answered = true;
    S.log.push({ok, q:item.q||item.s, yours, right, why:item.why||''});
    record(item, ok);
  }

  // ---------- Yönlendirme ----------
  function go(){
    const r = location.hash.replace(/^#\/?/,'');
    S.route = TITLES[r] ? r : 'ozet';
    $$('#nav a').forEach(a=>{
      const on = a.dataset.r===S.route;
      if(on){ a.setAttribute('aria-current','page'); if(a.scrollIntoView) a.scrollIntoView({block:'nearest',inline:'center'}) }
      else a.removeAttribute('aria-current');
    });
    document.title = (S.route==='ozet'?'':TITLES[S.route]+' · ')+'BUS101';
    $('#chapters').hidden = S.route==='ozet';
    window.scrollTo(0,0);
    enter();
  }
  // Kaldığın yer: mod ve bölüm başına saklanır, yenileyince ya da menüden dönünce devam eder.
  const SESSION_V=1;
  const hasSession = ()=>!['ozet','sozluk','hatalar'].includes(S.route);
  const sessKey = ()=>`bia-session|${S.route}|${S.ch}${S.route==='kartlar'?'|'+S.cardView:''}`;
  function clearSession(){ try{ localStorage.removeItem(sessKey()) }catch(e){} }
  function saveSession(){
    if(!hasSession()) return;
    if(S.route==='test'&&S.testPhase!=='run') return clearSession();
    store.set(sessKey(),{v:SESSION_V, i:S.i, score:S.score, log:S.log, started:S.started, order:S.route==='kartlar'?S.order.map(key):S.order});
  }
  function resume(){
    if(!hasSession()) return false;
    const s=store.get(sessKey(),null);
    if(!s||s.v!==SESSION_V) return false;
    let order=s.order, i=s.i;
    if(S.route==='kartlar'){
      // Başka görünümde taşınan kartlar listeye yansır; mevcut kart hâlâ varsa onda kalınır.
      const pool=cardPool().map(key), keep=s.order.filter(k=>pool.includes(k));
      const keys=keep.concat(pool.filter(k=>!keep.includes(k))), at=keys.indexOf(s.order[s.i]);
      order=keys.map(k=>cardByKey[k]); i=at>=0?at:Math.min(s.i,keys.length);
    }
    if(i>=order.length) return false;
    S.order=order; S.i=i; S.score=s.score; S.log=s.log||[]; S.started=s.started; S.flipped=false; S.answered=false;
    if(S.route==='test') S.testPhase='run';
    render();
    return true;
  }
  function enter(){ S.lastKnown=null; if(!resume()) start(S.route!=='kartlar') }
  function start(shuf){
    S.i=0; S.flipped=false; S.answered=false; S.score={ok:0,no:0}; S.log=[]; S.lastKnown=null;
    clearSession();
    if(S.route==='ozet') return renderHome();
    if(S.route==='sozluk') return renderDict();
    if(S.route==='test'){ S.testPhase='setup'; return renderSetup() }
    if(S.route==='hatalar') S.order = shuffle(Object.keys(wrong).map(resolve).filter(x=>x&&(!S.ch||x.ch===S.ch)));
    else if(S.route==='kartlar'){ const p=cardPool(); S.order = shuf?shuffle(p):p }
    else { const p=byCh(ROUTE_SRC[S.route]()); S.order = shuffle(p) }
    saveSession();
    render();
  }
  function step(d){ S.i=Math.max(0,S.i+d); S.flipped=false; S.answered=false; S.lastKnown=null; saveSession(); render(); $('#view').focus({preventScroll:true}); window.scrollTo(0,0) }

  // ---------- Ortak parçalar ----------
  function bar(pct){ return `<div class="bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>` }
  function header(total){
    const n = Math.min(S.i+1,total);
    let extra = `✓ ${S.score.ok} · ✗ ${S.score.no}`, pct = S.i/total*100;
    if(S.route==='kartlar'){ const all=byCh(CARDS), k=all.filter(c=>known[key(c)]).length; extra=`Bildiğin: ${k}/${all.length}`; pct=k/all.length*100 }
    return `<div class="progress"><div class="meta"><span>${n} / ${total}</span><span>${extra}</span></div>${bar(pct)}</div>`;
  }
  const chLabel = ch=>`Bölüm ${ch}`;
  function nextBtn(){ return `<button class="btn pri" id="next" hidden>Sonraki →</button>` }
  function revealNext(){ const n=$('#next'); n.hidden=false; n.focus({preventScroll:true}); n.onclick=()=>step(1) }

  function render(){
    const v=$('#view'), total=S.order.length;
    if(!total) return renderEmpty(v);
    if(S.i>=total) return renderEnd(v,total);
    const it=S.order[S.i];
    if(S.route==='kartlar') return renderCard(v,it,total);
    if(it.kind==='tf') renderTF(v,it,total);
    else if(it.kind==='fill') renderFill(v,it,total);
    else if(it.kind==='choice') renderChoice(v,it,total);
    else renderOpen(v,it,total);
    if(S.route==='hatalar') return;
    v.insertAdjacentHTML('beforeend',`<div class="tools"><button class="link" id="restart">${S.route==='test'?'Testi bırak':'Baştan başla'}</button></div>`);
    $('#restart').onclick=()=>start(true);
  }
  function cardTabs(){
    const all=byCh(CARDS), k=all.filter(c=>known[key(c)]).length;
    return `<div class="seg two" role="group" aria-label="Kart listesi">
      <button class="chip" data-view="todo" aria-pressed="${S.cardView==='todo'}">Çalışılacak (${all.length-k})</button>
      <button class="chip" data-view="known" aria-pressed="${S.cardView==='known'}">Bildiklerim (${k})</button></div>`;
  }
  function bindCardTabs(){
    $$('[data-view]').forEach(b=>b.onclick=()=>{ S.cardView=b.dataset.view; enter(); window.scrollTo(0,0) });
  }
  function renderEmpty(v){
    if(S.route==='hatalar'){
      v.innerHTML=`<div class="panel"><h1>Tekrar edilecek hata yok</h1><p class="small">Test, doğru/yanlış ve boşlukta yanlış yaptığın sorular buraya gelir. Doğru bildiğinde listeden düşer.</p><a class="btn pri" href="#/test">Test çöz</a></div>`;
      return;
    }
    v.innerHTML = cardTabs()+(S.cardView==='known'
      ? `<div class="panel"><h1>Henüz bildiğin kart yok</h1><p class="small">“Biliyorum” dediğin kartlar buraya gelir, istediğin zaman yeniden bakarsın.</p></div>`
      : `<div class="panel"><h1>Çalışılacak kart kalmadı</h1><p class="small">Bu seçimdeki kartların hepsini “Biliyorum” olarak işaretledin. Tekrar için Bildiklerim'e geç.</p></div>`);
    bindCardTabs();
  }
  function renderEnd(v,total){
    if(S.route==='kartlar'){
      const all=byCh(CARDS), k=all.filter(c=>known[key(c)]).length;
      v.innerHTML=`${cardTabs()}<div class="panel"><h1>Listenin sonuna geldin</h1><p>${k}/${all.length} kartı biliyorsun.</p><div class="btns"><button class="btn" id="again">Baştan</button><button class="btn pri" id="againS">Karıştırıp tekrar</button></div></div>`;
      bindCardTabs();
      $('#again').onclick=()=>start(false); $('#againS').onclick=()=>start(true);
      return;
    }
    const answered = S.score.ok+S.score.no, pct = answered?Math.round(S.score.ok/answered*100):0;
    const misses = S.log.filter(l=>!l.ok);
    let time='';
    if(S.route==='test'){
      const sec=Math.round((Date.now()-S.started)/1000);
      time=` · ${Math.floor(sec/60)} dk ${sec%60} sn`;
      if(S.testPhase==='run'){ tests.push({t:Date.now(),s:pct,n:total,ch:S.ch}); tests=tests.slice(-20); saveProgress(); S.testPhase='done'; saveSession() }
    }
    const review = misses.length?`<div class="review"><h2>Yanlışların</h2>${misses.map(m=>`<article><b>${esc(m.q)}</b><span>Doğrusu: ${esc(m.right)}${m.yours?` · Senin cevabın: ${esc(m.yours)}`:''}</span>${m.why?`<span class="small">${esc(m.why)}</span>`:''}</article>`).join('')}</div>`:'';
    const hasWrong = Object.keys(wrong).length>0;
    v.innerHTML=`<div class="panel"><span class="eyebrow">Sonuç</span><div class="score">${pct}<span class="small"> / 100</span></div>
      <p>Doğru: ${S.score.ok} · Yanlış: ${S.score.no}${time}</p>${verdict(pct)}${review}
      <div class="btns"><button class="btn" id="again">${S.route==='test'?'Ayarlara dön':'Yeniden başla'}</button>${hasWrong&&S.route!=='hatalar'?`<a class="btn pri" href="#/hatalar">Hatalarımı çalış</a>`:`<button class="btn pri" id="againS">${S.route==='test'?'Yeni test':'Karıştırıp tekrar'}</button>`}</div></div>`;
    $('#again').onclick=()=>start(true);
    const a=$('#againS'); if(a) a.onclick=()=>S.route==='test'?beginTest():start(true);
  }
  function verdict(p){
    if(p>=85) return `<p class="fb ok">Çok iyi. Bu konuda sınava hazır görünüyorsun.</p>`;
    if(p>=60) return `<p class="fb info">Fena değil. Yanlışlarını tekrar edersen hızla yükselir.</p>`;
    return `<p class="fb no">Önce kartlara dön, sonra testi yeniden dene.</p>`;
  }

  // ---------- Özet ----------
  function nextExam(){
    const now=new Date(), today=new Date(now); today.setHours(0,0,0,0);
    for(const e of EXAMS){
      const [y,m,d]=e.date.split('-').map(Number), [hh,mm]=(e.time||'23:59').split(':').map(Number);
      const day=new Date(y,m-1,d), left=new Date(y,m-1,d,hh,mm)-now;
      if(left<0) continue;
      return {name:e.name, note:e.note||'', time:e.time?e.time.replace(':','.'):'', days:Math.round((day-today)/864e5),
              hours:Math.floor(left/36e5), mins:Math.floor(left%36e5/6e4),
              label:day.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})};
    }
  }
  function renderHome(){
    const ex=nextExam(), wn=Object.keys(wrong).length;
    const solvedOk=Object.values(solved).filter(Boolean).length;
    const kn=CARDS.filter(c=>known[key(c)]).length;
    const last=tests[tests.length-1];
    const hero = ex
      ? `<span class="eyebrow">${esc(ex.name)} · ${esc(ex.label)}${ex.time?' · '+ex.time:''}</span><h1>${ex.days===0?(ex.time?`Sınav bugün ${ex.time}'da`:'Sınav bugün'):ex.days===1?'Sınav yarın':`Sınava ${ex.days} gün kaldı`}</h1>
         <p class="small">${ex.days===0&&ex.time?`${ex.hours?ex.hours+' saat ':''}${ex.mins} dakika kaldı. `:''}${esc(ex.note)}</p>`
      : `<span class="eyebrow">Business in Action</span><h1>Bugün neye çalışalım?</h1>`;
    $('#view').innerHTML=`
      <section class="panel hero">${hero}
        <div class="actions"><a class="btn" href="#/test">Teste başla</a>${wn?`<a class="btn ghost" href="#/hatalar">Hatalarımı çalış (${wn})</a>`:`<a class="btn ghost" href="#/kartlar">Kartlara başla</a>`}</div>
      </section>
      <section class="stats" aria-label="Genel durum">
        <button class="stat" id="goKnown"><b>${kn}/${CARDS.length}</b><span>bilinen kart</span></button>
        <div class="stat"><b>${solvedOk}</b><span>doğru soru</span></div>
        <div class="stat"><b>${last?last.s:'–'}</b><span>son test puanı</span></div>
      </section>
      <section class="panel"><h2>Bölümlere göre ilerleme</h2><div>${CHAPTERS.map(chapterRow).join('')}</div></section>
      <section class="panel"><h2>Sık karıştırılanlar</h2><ul class="pairs">${CONFUSED.map(c=>`<li><b>${esc(c[0])}</b><span>${esc(c[1])}</span></li>`).join('')}</ul></section>
      <div class="tools"><button class="link danger" id="wipe">İlerlememi sıfırla</button></div>`;
    $$('[data-goch]').forEach(b=>b.onclick=()=>{ setChapter(+b.dataset.goch); location.hash='#/kartlar' });
    $('#goKnown').onclick=()=>{ S.cardView='known'; location.hash='#/kartlar' };
    const w=$('#wipe');
    w.onclick=()=>{
      if(w.dataset.sure){ known={}; wrong={}; solved={}; tests=[]; saveProgress(); try{ Object.keys(localStorage).filter(k=>k.startsWith('bia-session|')).forEach(k=>localStorage.removeItem(k)) }catch(e){} renderHome(); return }
      w.dataset.sure='1'; w.textContent='Emin misin? Bilinen kartlar, hatalar, test sonuçları ve kaldığın yerler silinecek. Sıfırlamak için yeniden dokun.';
    };
  }
  function chapterRow(c){
    const cards=CARDS.filter(x=>x.ch===c.id), k=cards.filter(x=>known[key(x)]).length;
    const qs=[].concat(TF.filter(x=>x.ch===c.id).map(x=>x.id),FILL.filter(x=>x.ch===c.id).map(x=>x.id),MCQ.filter(x=>x.ch===c.id).map(x=>'mcq|'+x.q));
    const ok=qs.filter(id=>solved[id]).length;
    return `<div class="chrow"><div class="chhead"><button data-goch="${c.id}">Bölüm ${c.id} · ${esc(c.name)}</button><span class="small">${esc(c.src)}</span></div>
      ${bar((k+ok)/(cards.length+qs.length)*100)}<span class="small">${k}/${cards.length} kart · ${ok}/${qs.length} soru</span></div>`;
  }

  // ---------- Kartlar ----------
  function renderCard(v,c,total){
    const front = S.termFirst
      ? `<div class="big">${esc(c.term)}</div><p class="small">Tanımını hatırlamaya çalış, sonra kartı çevir.</p>`
      : `<p class="txt">${esc(c.def)}</p><p class="small">Bu hangi kavram? Düşün, sonra kartı çevir.</p>`;
    const exHtml = c.ex?`<p class="ex">${esc(c.ex)}</p>`:'';
    const back = S.termFirst
      ? `<p class="txt">${esc(c.def)}</p>${exHtml}`
      : `<div class="big">${esc(c.term)}</div>${exHtml}<p class="small">${esc(c.def)}</p>`;
    const inKnown=S.cardView==='known';
    v.innerHTML=`${cardTabs()}${header(total)}
      <div class="tools">
        <button class="chip" id="dir" aria-pressed="${S.termFirst}">Önce terimi göster</button>
        <button class="chip" id="shf">Karıştır</button></div>
      ${S.lastKnown?`<p class="fb ok small-fb"><span>“${esc(S.lastKnown.term)}” Bildiklerim'e taşındı.</span> <button class="link" id="undo">Geri al</button></p>`:''}
      <div class="scene"><div class="flip ${S.flipped?'on':''}" id="flip" tabindex="0" role="button" aria-pressed="${S.flipped}" aria-label="Kartı çevir">
        <div class="face"><div class="lbl"><span>${S.termFirst?'Terim':'Tanım'}</span><span>${chLabel(c.ch)}</span></div>${front}</div>
        <div class="face back"><div class="lbl"><span>${S.termFirst?'Tanım':'Cevap'}</span><span>${inKnown?'✓ Biliyorum':chLabel(c.ch)}</span></div>${back}</div>
      </div></div>
      <p class="hint">Çevirmek için karta dokun<span class="kbd"> · <kbd>Boşluk</kbd> çevir, ${inKnown?'':'<kbd>1</kbd> tekrar, <kbd>2</kbd> biliyorum, '}<kbd>←</kbd> <kbd>→</kbd> gezin</span></p>
      ${inKnown
        ?`<button class="btn bad" id="back">Çalışılacaklara geri al</button>`
        :`<div class="btns"><button class="btn bad" id="no">Tekrar et</button><button class="btn good" id="yes">Biliyorum</button></div>`}
      <div class="btns"><button class="btn" id="prev" ${S.i?'':'disabled'}>← Önceki</button><button class="btn" id="nextCard">Sonraki →</button></div>`;
    const fl=$('#flip');
    fl.onclick=()=>{ S.flipped=!S.flipped; fl.classList.toggle('on',S.flipped); fl.setAttribute('aria-pressed',S.flipped) };
    fl.onkeydown=e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); fl.onclick() } };
    bindCardTabs();
    const moved=()=>{ S.order.splice(S.i,1); S.flipped=false; saveProgress(); saveSession(); render(); window.scrollTo(0,0) };
    $('#dir').onclick=()=>{ S.termFirst=!S.termFirst; S.flipped=false; render() };
    $('#shf').onclick=()=>start(true);
    if(inKnown) $('#back').onclick=()=>{ delete known[key(c)]; moved() };
    else {
      $('#yes').onclick=()=>{ known[key(c)]=1; S.lastKnown=c; moved() };
      $('#no').onclick=()=>step(1);
    }
    const undo=$('#undo');
    if(undo) undo.onclick=()=>{ const u=S.lastKnown; delete known[key(u)]; S.order.splice(S.i,0,u); S.lastKnown=null; saveProgress(); saveSession(); render() };
    $('#prev').onclick=()=>step(-1); $('#nextCard').onclick=()=>step(1);
  }

  // ---------- Doğru / Yanlış ----------
  function renderTF(v,t,total){
    v.innerHTML=`${header(total)}<div class="panel"><span class="eyebrow">${chLabel(t.ch)} · Doğru mu, yanlış mı?</span><p class="q">${esc(t.q)}</p>
      <div class="btns"><button class="btn" data-a="1">Doğru</button><button class="btn" data-a="0">Yanlış</button></div>
      <div id="fb" aria-live="polite"></div>${nextBtn()}</div>`;
    $$('[data-a]').forEach(b=>b.onclick=()=>{
      if(S.answered) return;
      const ok=(b.dataset.a==='1')===t.a, right=t.a?'Doğru':'Yanlış';
      answer(t,ok,b.textContent,right);
      $$('[data-a]').forEach(x=>{ x.disabled=true; if((x.dataset.a==='1')===t.a) x.classList.add('is-good'); else if(x===b) x.classList.add('is-bad') });
      $('#fb').innerHTML=`<div class="fb ${ok?'ok':'no'}"><b>${ok?'Doğru bildin.':'Yanlış.'} Cevap: ${right}</b>${esc(t.why||'')}</div>`;
      revealNext();
    });
  }

  // ---------- Boşluk ----------
  function renderFill(v,f,total){
    const parts=f.s.split('___');
    v.innerHTML=`${header(total)}<div class="panel"><span class="eyebrow">${chLabel(f.ch)} · Boşluğu doldur</span>
      <p class="q">${esc(parts[0])}<span class="blank">&nbsp;</span>${esc(parts[1]||'')}</p>
      <form id="ff"><input type="text" id="fillIn" aria-label="Cevabın" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cevabını yaz"></form>
      <div class="btns"><button class="btn" id="show" type="button">Cevabı göster</button><button class="btn pri" id="check" type="button">Kontrol et</button></div>
      <div id="fb" aria-live="polite"></div>${nextBtn()}</div>`;
    const inp=$('#fillIn');
    inp.focus({preventScroll:true});
    const done=(ok,shown)=>{
      if(S.answered) return;
      answer(f,ok,shown?'':inp.value.trim(),f.a[0]);
      $('#fb').innerHTML=`<div class="fb ${ok?'ok':'no'}"><b>${ok?'Doğru!':(shown?'Cevap':'Olmadı.')}</b>Kabul edilen: ${f.a.map(esc).join(' / ')}</div>`;
      inp.readOnly=true; $('#check').disabled=true; $('#show').disabled=true;
      revealNext();
    };
    const check=e=>{ e&&e.preventDefault(); if(S.answered) return; const val=norm(inp.value); if(!val){ inp.focus(); return } done(f.a.some(a=>norm(a)===val),false) };
    $('#ff').onsubmit=check; $('#check').onclick=check; $('#show').onclick=()=>done(false,true);
  }

  // ---------- Çoktan seçmeli ----------
  function renderChoice(v,t,total){
    v.innerHTML=`${header(total)}<div class="panel"><span class="eyebrow">${chLabel(t.ch)} · ${esc(t.label)}</span><p class="q">${esc(t.q)}</p>
      <div class="options">${t.opts.map((o,i)=>`<button class="btn" data-o="${i}"><b>${String.fromCharCode(65+i)}</b><span>${esc(o)}</span></button>`).join('')}</div>
      <div id="fb" aria-live="polite"></div>${nextBtn()}</div>`;
    $$('[data-o]').forEach(b=>b.onclick=()=>{
      if(S.answered) return;
      const pick=t.opts[+b.dataset.o], ok=pick===t.a;
      answer(t,ok,pick,t.a);
      $$('[data-o]').forEach(x=>{ const o=t.opts[+x.dataset.o]; x.disabled=true; if(o===t.a) x.classList.add('is-good'); else if(x===b) x.classList.add('is-bad') });
      const picked = !ok&&t.isDef ? CARDS.find(c=>c.ch===t.ch&&c.term===pick) : null;
      $('#fb').innerHTML=`<div class="fb ${ok?'ok':'no'}"><b>${ok?'Doğru!':'Yanlış. Doğru cevap: '+esc(t.a)}</b>${t.why?`<p>${esc(t.why)}</p>`:''}${picked?`<p class="small">Seçtiğin ${esc(pick)}: ${esc(picked.def)}</p>`:''}</div>`;
      revealNext();
    });
  }

  // ---------- Açık uçlu ----------
  function renderOpen(v,o,total){
    v.innerHTML=`${header(total)}<div class="panel"><span class="eyebrow">${chLabel(o.ch)} · Açık uçlu</span><p class="q">${esc(o.q)}</p>
      <textarea id="openAns" aria-label="Cevabın" placeholder="Önce kendi cevabını yaz (isteğe bağlı)"></textarea>
      <button class="btn pri" id="reveal">Örnek cevabı göster</button>
      <div id="ans" hidden><div class="fb info"><b>Örnek cevap</b>${esc(o.model)}</div>
        <p class="small" style="margin:12px 0 6px">Cevabında bunlar var mıydı?</p>
        <ul class="keys">${o.keys.map((k,i)=>`<li><label><input type="checkbox" id="k${i}"> ${esc(k)}</label></li>`).join('')}</ul></div>
      <div class="btns" id="self" hidden><button class="btn bad" id="miss">Eksik kaldı</button><button class="btn good" id="got">Tam bildim</button></div></div>`;
    $('#reveal').onclick=()=>{ $('#ans').hidden=false; $('#self').hidden=false; $('#reveal').hidden=true };
    $('#got').onclick=()=>{ S.score.ok++; S.log.push({ok:true,q:o.q,right:o.model}); step(1) };
    $('#miss').onclick=()=>{ S.score.no++; S.log.push({ok:false,q:o.q,right:o.model}); step(1) };
  }

  // ---------- Test ----------
  function renderSetup(){
    const history=tests.slice(-5).reverse();
    const scope=S.ch?`Bölüm ${S.ch}`:'tüm bölümler';
    $('#view').innerHTML=`<div class="panel"><h1>Sınav provası</h1>
      <p>Senaryo soruları, tanım soruları ve doğru/yanlış karışık gelir. Kapsam: ${scope}. Her açılışta yeni bir test oluşur.</p>
      <div><p class="small" style="margin-bottom:8px">Soru sayısı</p>
      <div class="seg" role="group" aria-label="Soru sayısı">${[10,20,40].map(n=>`<button class="chip" data-n="${n}" aria-pressed="${S.testN===n}">${n}</button>`).join('')}</div></div>
      <button class="btn pri" id="begin">Teste başla</button></div>
      ${history.length?`<div class="panel"><h2>Son testlerin</h2><div class="review">${history.map(h=>`<article><b>${h.s} / 100</b><span class="small">${new Date(h.t).toLocaleDateString('tr-TR',{day:'numeric',month:'long'})} · ${h.n} soru · ${h.ch?'Bölüm '+h.ch:'Tüm bölümler'}</span></article>`).join('')}</div></div>`:''}`;
    $$('[data-n]').forEach(b=>b.onclick=()=>{ S.testN=+b.dataset.n; renderSetup() });
    $('#begin').onclick=beginTest;
  }
  function beginTest(){
    S.order=buildTest(S.testN); S.i=0; S.answered=false; S.score={ok:0,no:0}; S.log=[]; S.testPhase='run'; S.started=Date.now();
    saveSession();
    render(); window.scrollTo(0,0);
  }

  // ---------- Sözlük ----------
  function renderDict(){
    $('#view').innerHTML=`<h1>Sözlük</h1><input type="search" id="q" aria-label="Sözlükte ara" placeholder="Kavram, tanım ya da örnek ara" autocomplete="off">
      <p class="small" id="dictN" aria-live="polite"></p><div class="dict" id="dict"></div>`;
    const inp=$('#q');
    const draw=()=>{
      const q=norm(inp.value);
      const list=byCh(CARDS).filter(c=>!q||norm(c.term+' '+c.def+' '+(c.ex||'')).includes(q));
      $('#dictN').textContent=`${list.length} kavram`;
      $('#dict').innerHTML=list.map(c=>`<article class="entry"><header><b>${esc(c.term)}</b><span class="badge">${chLabel(c.ch)}</span></header><span>${esc(c.def)}</span>${c.ex?`<span class="small">${esc(c.ex)}</span>`:''}</article>`).join('')
        || `<div class="panel"><p>Sonuç bulunamadı. Başka bir kelime dene ya da bölüm filtresini “Tümü” yap.</p></div>`;
    };
    inp.oninput=draw; draw();
  }

  // ---------- Kabuk ----------
  function setChapter(ch){
    S.ch=ch; store.set('bia-ch',ch);
    $$('#chapters .chip').forEach(x=>x.setAttribute('aria-pressed',+x.dataset.ch===ch));
  }
  function updateWrongCount(){
    const n=Object.keys(wrong).length, el=$('#wrongCount');
    el.hidden=!n; el.textContent=n;
  }
  $('#chapters').innerHTML=`<button class="chip" data-ch="0" aria-pressed="false">Tümü</button>`+
    CHAPTERS.map(c=>`<button class="chip" data-ch="${c.id}" aria-pressed="false">Bölüm ${c.id}<span class="kbd"> · ${esc(c.name)}</span></button>`).join('');
  $$('#chapters .chip').forEach(b=>b.onclick=()=>{ setChapter(+b.dataset.ch); enter() });

  const THEMES=[['auto','Tema: otomatik'],['light','Tema: açık'],['dark','Tema: koyu']];
  let theme=(()=>{ try{ return localStorage.getItem('bia-theme')||'auto' }catch(e){ return 'auto' } })();
  function paintTheme(){
    $('#theme').textContent=THEMES.find(t=>t[0]===theme)[1];
    if(theme==='auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme',theme);
  }
  $('#theme').onclick=()=>{
    theme=THEMES[(THEMES.findIndex(t=>t[0]===theme)+1)%3][0];
    try{ localStorage.setItem('bia-theme',theme) }catch(e){}
    paintTheme();
  };

  // Klavye kısayolları
  document.addEventListener('keydown',e=>{
    if(e.metaKey||e.ctrlKey||e.altKey||/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k=e.key.toLocaleLowerCase('tr'), click=sel=>{ const b=$(sel); if(b&&!b.disabled&&!b.hidden){ e.preventDefault(); b.click() } };
    if(S.route==='kartlar'){
      if(k==='arrowright') click('#nextCard');
      else if(k==='arrowleft') click('#prev');
      else if(k===' ') click('#flip');
      else if(k==='1') click('#no');
      else if(k==='2') click('#yes');
      return;
    }
    if(S.answered) return;
    if($('[data-o]')){
      if(/^[1-4]$/.test(k)) click(`[data-o="${+k-1}"]`);
      else if(/^[abcd]$/.test(k)) click(`[data-o="${k.charCodeAt(0)-97}"]`);
    }
    else if(k==='d') click('[data-a="1"]');
    else if(k==='y') click('[data-a="0"]');
  });

  setChapter(CHAPTERS.some(c=>c.id===S.ch)?S.ch:0);
  paintTheme();
  updateWrongCount();
  window.addEventListener('hashchange',go);
  go();

  if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
