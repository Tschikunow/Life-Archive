/* LIFEARCHIVE account recovery helpers */
(function(){
  'use strict';
  const existingAuth=authView,existingSignup=signupView;
  function addConfirmationControl(){
    if(document.getElementById('resend-confirmation'))return;
    const form=document.getElementById('login');
    if(!form)return;
    const container=document.createElement('div');
    container.className='stack';
    container.style.marginTop='18px';
    container.innerHTML='<button class="btn small" type="button" id="resend-confirmation">Bestätigungs-E-Mail erneut senden</button><small class="muted" id="resend-info">Falls du keine Bestätigungsmail erhalten hast.</small>';
    form.after(container);
    document.getElementById('resend-confirmation').onclick=async e=>{
      const email=form.querySelector('input[name=email]').value.trim();
      if(!email){toast('Bitte erst deine E-Mail-Adresse eingeben');return}
      e.currentTarget.disabled=true;
      try{
        const {error}=await db.auth.resend({type:'signup',email});
        if(error)throw error;
        toast('Wenn die Adresse noch nicht bestätigt ist, wird eine Bestätigungsmail gesendet.');
      }catch(error){err(error)}
      finally{e.currentTarget.disabled=false}
    };
  }
  authView=function(){existingAuth();addConfirmationControl()};
  signupView=function(){
    existingSignup();
    const form=document.getElementById('reg');
    if(!form)return;
    const tip=document.createElement('p');
    tip.className='muted';tip.style.fontSize='12px';
    tip.textContent='Nach der Registrierung deine E-Mail bestätigen und dann anmelden. Wähle ein eigenes, starkes Passwort.';
    form.after(tip);
  };
})();
