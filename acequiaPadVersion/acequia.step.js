let busyTurtles = this.howManyOnMission();
this.turtles.ask(t => {
  if (!t.onMission) {
    this.flock(t);
    this.findHeight(t);
    if (busyTurtles < this.MAX_MISSIONARIES && Math.random() > 0.999) {
      this.sendOnMission(t);
    }
  } else {
    this.doMission(t);
    // fly twards destination
  }
});
if (this.anim.ticks % 30 == 0) {
  // console.log("missionaries", this.howManyOnMission());
  if (this.PUBLISH_TO_FB) {
    this.publishToFirebase();
  }
}
