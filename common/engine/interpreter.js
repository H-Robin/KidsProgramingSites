export class Interpreter {
  constructor({ programList, onTick, onReset }){
    this.programList = programList;
    this.onTick = onTick;
    this.onReset = onReset;
    this.timer = null;
    this.ip = 0;
  }
  readProgram(){
    return [...this.programList.querySelectorAll("li")].map(li=>li.dataset.cmd);
  }
  async run(){
    this.stop();
    const prog = this.readProgram();
    this.ip = 0;
    const tick = () => {
      if(this.ip >= prog.length){ this.stop(); return; }
      this.onTick?.(prog[this.ip++]);
    };
    this.timer = setInterval(tick, 320);
  }
  step(){
    this.stop();
    const prog = this.readProgram();
    if(this.ip >= prog.length) return;
    this.onTick?.(prog[this.ip++]);
  }
  stop(){
    if(this.timer){ clearInterval(this.timer); this.timer=null; }
  }
  reset(){
    this.stop(); this.ip = 0; this.onReset?.();
  }
}