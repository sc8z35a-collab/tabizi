'use strict';
(async()=>{
  const iframe=document.getElementById('test-game'),results=document.getElementById('test-results');
  const lines=[];let passed=0;
  function assert(ok,message){const line=(ok?'PASS ':'FAIL ')+message;lines.push(line);results.textContent=lines.join('\n');console[ok?'info':'error'](line);if(!ok)throw new Error(message);passed++;}
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try{
    const start=performance.now();while(!iframe.contentWindow.verdantWorld){if(performance.now()-start>95000)throw new Error('Initialization timed out');await wait(100);}
    const w=iframe.contentWindow,d=w.document,game=w.verdantWorld,x=game.expansion,t=x.test,s=()=>x.getState();
    assert(s().enemies.filter(e=>e.type==='goblin').length===6,'Six goblins exist in the live scene');
    assert(s().enemies.filter(e=>e.type==='creatures').length===8,'Eight distinct human Creatures exist');
    assert(x.interact()===false,'Boarding is rejected when not near a vehicle');
    t.clearEnemies();let p=s().car;t.teleport(p.x+2,p.z);assert(x.interact()&&s().mode==='car','Board a nearby car');
    let z=game.getState().position.z;t.drive(1,{mx:0,mz:-1,running:false});assert(s().vehicleSpeed>10&&game.getState().position.z<z,'Car accelerates and moves across terrain');
    assert(!x.interact()&&s().mode==='car','Cannot exit a moving car');
    t.drive(5,{mx:0,mz:0,running:false});assert(x.interact()&&s().mode==='foot','Friction stops the car and permits exiting');
    p=s().plane;t.teleport(p.x+3,p.z);assert(x.interact()&&s().mode==='plane','Board the actual aircraft');
    t.holdAscend(true);t.drive(4,{mx:0,mz:-1,running:false});t.holdAscend(false);
    assert(s().altitude>5&&s().vehicleSpeed>20,'Aircraft accelerates, takes off and gains altitude');
    assert(!x.interact(),'Exiting the aircraft in flight is blocked');
    t.holdDescend(true);t.drive(6,{mx:0,mz:1,running:false});t.holdDescend(false);
    assert(s().altitude<.1&&s().vehicleSpeed<3,'Aircraft descends, lands and brakes');
    assert(x.interact()&&s().mode==='foot','Exit a landed aircraft');
    t.teleport(0,62);x.spawnGroup('goblin',true);assert(s().enemies.length===6,'A real goblin ambush is spawned');
    let before=Math.hypot(s().enemies[0].x,s().enemies[0].z-62);t.step(1);let after=Math.hypot(s().enemies[0].x,s().enemies[0].z-62);assert(after<before,'Goblins actively chase the player');
    assert(x.attack()&&s().projectiles>0,'Attack creates a visible ranged projectile');
    t.step(.7);assert(s().enemies.some(e=>e.hp<65),'Projectile collision damages an actual goblin');
    p=s().enemies[0];t.teleport(p.x,p.z+1);t.step(2.2);assert(s().hp<100,'Enemy attack telegraph resolves and reduces player HP');
    let health=s().hp;t.hurt(20);assert(s().hp<health,'Damage and player HP are connected');
    assert(x.heal()&&s().potions===2,'Healing restores HP and consumes a potion');
    assert(x.dodge(),'Dodge grants temporary evasion');health=s().hp;assert(!t.receiveDamage(20)&&s().hp===health,'Dodge invulnerability prevents actual incoming damage');
    t.clearEnemies();t.teleport(0,62);assert(x.startBoss(),'Boss encounter starts');
    assert(s().boss.hp===900&&s().weather==='storm','Boss has 900 HP and triggers a storm');
    t.hitNearest(470);t.step(.05);assert(s().boss.phase===2,'Boss enters phase II below half HP');
    t.hitNearest(1000);assert(s().boss.dead&&s().bossWins===1,'Boss can be defeated and victory is recorded');
    assert(d.getElementById('boss-hud').hidden,'Boss bar hides on victory');
    t.clearEnemies();t.teleport(0,62);x.spawnGroup('creatures',true);assert(s().enemies.length===8&&s().enemies.every(e=>e.aggro),'Creatures attack as an eight-person squad');
    const pos=s().enemies[0].x;x.update(1,true);assert(s().enemies[0].x===pos,'Paused dialogs freeze enemy simulation');
    for(const type of ['rain','fog','clear']){assert(x.setWeather(type)&&s().weather===type,'Weather can change to '+type);}
    x.setWeather('storm');t.step(3);assert(s().weatherIntensity>.4,'Weather appearance blends gradually rather than switching a label only');
    t.clearEnemies();t.hurt(1000);assert(s().dead&&d.getElementById('defeat-dialog').open,'Lethal damage opens the defeat screen');
    assert(!x.attack(),'Defeated player cannot attack');x.respawn();assert(!s().dead&&s().hp===100&&s().potions===3,'Respawn restores health and potions');
    assert(!d.getElementById('defeat-dialog').open,'Respawn closes defeat dialog');
    d.getElementById('events-button').click();assert(d.getElementById('events-dialog').open&&game.getState().paused,'Event board opens and pauses the game');
    d.querySelector('[data-weather="clear"]').click();await wait(200);assert(!game.getState().paused&&s().weather==='clear','Weather button executes its action and resumes play');
    t.clearEnemies();t.teleport(0,62);x.spawnGroup('creatures',true);t.hurt(1000);x.respawn();assert(s().enemies.every(e=>Math.hypot(e.x,e.z-62)>65),'Respawn relocates nearby ambushers away from the base');
    const save=localStorage.getItem('verdant-wildfront-v2');w.dispatchEvent(new w.Event('pagehide'));assert(localStorage.getItem('verdant-wildfront-v2')===save,'Self-test does not overwrite Wildfront save data');
    console.info('ALL '+passed+' WILDFRONT CHECKS PASSED');results.dataset.complete='true';
  }catch(e){console.error('WILDFRONT TEST FAILURE: '+e.message);results.dataset.complete='failed';results.textContent+='\nERROR '+e.message;}
})();
