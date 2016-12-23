'use strict';
(function() {
  let totalImages:number = -1;
  const param:any = {};
  const NUMBER_OF_IMAGES_PER_PAGE = 20;
  $(() => {
    param.order = -1;
    parseParams();
    getSummary();
  });
  $('#order').change(() => {
    const order = $('#order').is(':checked');
    console.log('order:' + order);
    param.order = (order) ? 1: -1;
    param.currentPage = 0;
    getImage(0);
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
    modal.find('.modal-body').html(`<img class="img-responsive" src="/raw/${button.data('src')}.JPG">`);
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
  function getLocalTime(info) {
    const d = new Date();
    if (info.localTime) {
      d.setTime(info.localTime);
    } else {
      d.setTime(info.mtime);
    }
    return d;
  }
  function createTag(src, info) {
    const d = getLocalTime(info);
    const img = `<img data-toggle="modal" data-target="#myModal" data-whatever="${info.fullPath}" data-src="${src}" src="/cache/${src}">`;
    const label = `${d}`;
    const caption = ''/*`<div class="caption">${label}</div>`*/;
    const thumbnail = `<div class="thumbnail">${img}${caption}</div>`;
    return thumbnail;
  }
  function getImage(page:number) {
    const from = page*NUMBER_OF_IMAGES_PER_PAGE;
    $.post('/cache/images', {
      order: param.order,
      from: from,
      maxImages: NUMBER_OF_IMAGES_PER_PAGE
    }, (data) => {
      const to = data.length;
      console.log('data.length:' + data.length);
      $('#images').html('');
      let predate = '';
      let row = 0;
      let count = 0;
      for (let i = 0; i < to; i++) {
        const d = getLocalTime(data[i][1]).toLocaleDateString();
        if (d !== predate) {
          $('#images').append(`<div class="row" id="title_${d}"><div class="col-sm-12 col-md-12"><h2>${d}</h2></div></div>`);
          predate = d;
          row = -1;
          count = 0;
        }
        const dd = d.replace(/\//g, '');
        if ((count % 4) == 0) {
          row++;
          $('#images').append(`<div class="row" id="date_${dd}_${row}"></div>`);
        }
        $(`#date_${dd}_${row}`).append(`<div class="col-sm-6 col-md-3" id="id_${i}"></div>`);
        $.get(`/cache/check/${data[i][0]}`, () => {
          $(`#id_${i}`).html(createTag(data[i][0], data[i][1]));
        }).fail(() => {
          $(`#id_${i}`).html(`<div>cannot get ${data[i][1].fullPath}</div>`)
        });
        count++;
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
