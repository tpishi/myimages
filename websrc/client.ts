'use strict';
$(function getSummary() {
  $.getJSON('http://127.0.0.1:8080/cache/summary', (data) => {
    if (data.totalImages !== 0) {
      const valuer = Math.floor(((data.preparedImages*100)/data.totalImages) + 0.5);
      $('.progress-bar').css('width', valuer+'%')
                        .attr('aria-valuenow', valuer)
                        .text(data.preparedImages + '/' + data.totalImages);
    }
    if (data.totalImages === 0 || data.totalImages !== data.preparedImages) {
      setTimeout(getSummary, 1000);
    }
  });
});
