// Tema sayfa çizilmeden uygulanır, böylece açılışta renk sıçraması olmaz.
try{
  var t=localStorage.getItem('bia-theme');
  if(t==='light'||t==='dark') document.documentElement.setAttribute('data-theme',t);
}catch(e){}
