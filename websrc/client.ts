'use strict';
(function() {
  let totalImages:number = -1;
  const param:any = {};
  const NUMBER_OF_IMAGES_PER_PAGE = 20;
  $(() => {
    parseParams();
    getSummary();
  });
  $('#previous').on('click', () => {
    if (param.currentPage !== 0) {
      param.currentPage--;
      getImage(param.currentPage);
    }
  });
  $('#next').on('click', () => {
    const from = param.currentPage*NUMBER_OF_IMAGES_PER_PAGE;
    const to = from + NUMBER_OF_IMAGES_PER_PAGE;
    if (to < totalImages) {
      param.currentPage++;
      getImage(param.currentPage);
    }
  });
  $('#myModal').on('show.bs.modal', (event) => {
    const button = $(event.relatedTarget); // Button that triggered the modal
    const recipient = button.data('whatever'); // Extract info from data-* attributes
    // If necessary, you could initiate an AJAX request here (and then do the updating in a callback).
    // Update the modal's content. We'll use jQuery here, but you could use a data binding library or other methods instead.
    const modal = $('#myModal');
    modal.find('.modal-title').text(recipient);
    modal.find('.modal-body').html(`<img class="img-responsive" src="/cache/onetime/${button.data('src')}.JPG">`);
  });
  function parseParams() {
    const search = $(location).attr('search');
    const p:Array<string> = search.split('=');
    if (p.length === 2) {
      param.currentPage = parseInt(p[1]);
    } else {
      param.currentPage = 0;
    }
  }
  function createTag(src, info) {
    const d = new Date();
    if (info.localTime) {
      d.setTime(info.localTime);
    } else {
      d.setTime(info.mtime);
    }
    const img = `<img data-toggle="modal" data-target="#myModal" data-whatever="${info.fullPath}" data-src="${src}" src="/cache/${src}">`;
    const label = `${d}`;
    const caption = `<div class="caption">${label}</div>`;
    const thumbnail = `<div class="thumbnail">${img}${caption}</div>`;
    return thumbnail;
  }
  function getImage(page:number) {
    $.getJSON('/cache/images', (data) => {
      const from = page*NUMBER_OF_IMAGES_PER_PAGE;
      let to = (from + NUMBER_OF_IMAGES_PER_PAGE);
      if (to > data.length) {
        to = data.length;
      }
      $('#images').html('');
      for (let i = from; i < to; i += 4) {
        const row = i;
        $('#images').append(`<div class="row" id="row_${row}"></div>`);
        for (let j = 0; j < 4; j++) {
          if (row + j < to) {
            $(`#row_${row}`).append(`<div class="col-sm-6 col-md-3" id="id_${row + j}"></div>`);
            $.get(`/cache/check/${data[row + j][0]}`, () => {
              $(`#id_${row + j}`).html(createTag(data[row + j][0], data[row + j][1]));
            }).fail(() => {
              $(`#id_${row + j}`).html(`<div>cannot get ${data[row + j][1].fullPath}</div>`)
            });
          }
        }
      }
    });
  }
  function getSummary() {
    $.getJSON('/cache/summary', (data) => {
      if (data.totalImages !== 0) {
        if (totalImages === -1) {
          totalImages = data.totalImages;
        }
        getImage(param.currentPage);
      } else {
        setTimeout(getSummary, 1000);
      }
    });
  }
})();
