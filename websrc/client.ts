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
    const imagetag = `<img class="img-responsive center-block" src="/cache/${src}"></img>`;
    const d = new Date();
    if (info.localTime) {
      d.setTime(info.localTime);
      return `${imagetag}<p class="text-center">${d}</p>`;
    } else {
      d.setTime(info.mtime);
      return `${imagetag}<p class="text-center">${d}?</p>`;
    }
  }
  function getImage(page:number) {
    $.getJSON('/cache/images', (data) => {
      const from = page*NUMBER_OF_IMAGES_PER_PAGE;
      let to = (from + NUMBER_OF_IMAGES_PER_PAGE);
      if (to > data.length) {
        to = data.length;
      }
      $('#images').html('');
      for (let i = from; i < to; i++) {
        $('#images').append(`<div class="row" id="id_${i}"></div>`);
        $.get(`/cache/check/${data[i][0]}`, () => {
          $(`#id_${i}`).html(createTag(data[i][0], data[i][1]));
        }).fail(() => {
          $(`#id_${i}`).html(`<div>cannot get ${data[i][1].fullPath}</div>`)
        });
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
