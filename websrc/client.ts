'use strict';
(function() {
  let totalImages:number = -1;
  let imageLoaded:boolean = false;
  $(() => {
    getSummary();
  });
  function getImage() {
    $.getJSON('http://127.0.0.1:8080/cache/images', (data) => {
      if (!imageLoaded && data.length >= 10) {
        for (let i = 0; i < 10; i++) {
          $('#images').append('<img src="http://127.0.0.1:8080/cache/' + data[i][0] + '"></img>');
        }
      }
    });
  }
  function getSummary() {
    $.getJSON('http://127.0.0.1:8080/cache/summary', (data) => {
      if (data.totalImages !== 0) {
        if (totalImages === -1) {
          totalImages = data.totalImages;
          setTimeout(getImage(), 0);
        }
        const valuer = Math.floor(((data.preparedImages*100)/data.totalImages) + 0.5);
        $('.progress-bar').css('width', valuer+'%')
                          .attr('aria-valuenow', valuer)
                          .text(data.preparedImages + '/' + data.totalImages);
      }
      if (data.totalImages === 0 || data.totalImages !== data.preparedImages) {
        setTimeout(getSummary, 1000);
      }
    });
  }
})();
