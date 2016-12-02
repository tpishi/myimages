'use strict';
function getSummary() {
  const req = new XMLHttpRequest();
  req.open('GET', 'http://127.0.0.1:8080/cache/summary', true);
  req.onload = (e) => {
    const elem = document.getElementById('myprogress');
    if (req.readyState == 4) {
      if (req.status === 200) {
        const json = JSON.parse(req.responseText);
        if (json.totalImages === 0) {
          setTimeout(getSummary, 1000);
        } else if (json.preparedImages < json.totalImages) {
          const valuer = Math.floor(((json.preparedImages*100)/json.totalImages) + 0.5);
          $('.progress-bar').css('width', valuer+'%').attr('aria-valuenow', valuer);
          elem.innerText = json.preparedImages + '/' + json.totalImages;
          setTimeout(getSummary, 1000);
        } else if (json.preparedImages === json.totalImages) {
          const valuer = 100;
          $('.progress-bar').css('width', valuer+'%').attr('aria-valuenow', valuer);
          elem.innerText = json.preparedImages + '/' + json.totalImages;
        }
      } else {
        elem.innerText = 'error';
      }
    }
  }
  req.send(null);
}
window.onload = function() {
  getSummary();
}
