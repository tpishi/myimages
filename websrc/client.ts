'use strict';
function getSummary() {
  const req = new XMLHttpRequest();
  req.open('GET', 'http://127.0.0.1:8080/cache/summary', true);
  req.onload = (e) => {
    const elem = document.getElementById('test');
    if (req.readyState == 4) {
      if (req.status === 200) {
        const json = JSON.parse(req.responseText);
        if (json.totalImages === 0) {
          elem.innerText = 'loading';
          setTimeout(getSummary, 1000);
        } else if (json.preparedImages < json.totalImages) {
          elem.innerText = json.preparedImages + '/' + json.totalImages;
          setTimeout(getSummary, 1000);
        } else if (json.preparedImages === json.totalImages) {
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
