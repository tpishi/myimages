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
      window.location.href = '/index.html?page=' + (param.currentPage - 1);
    }
  });
  $('#next').on('click', () => {
    const from = param.currentPage*NUMBER_OF_IMAGES_PER_PAGE;
    const to = from + NUMBER_OF_IMAGES_PER_PAGE;
    if (to < totalImages) {
      window.location.href = '/index.html?page=' + (param.currentPage + 1);
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
    if (info.localTime) {
      const d = new Date();
      d.setTime(info.localTime);
      return `<div class="row">${imagetag}<p class="text-center">${d}</p></div>`;
    } else {
      return `<div class="row">${imagetag}</div>`;
    }
  }
  function getImage() {
    $.getJSON('/cache/images', (data) => {
      const from = param.currentPage*NUMBER_OF_IMAGES_PER_PAGE;
      const to = from + NUMBER_OF_IMAGES_PER_PAGE;
      for (let i = from; i < to; i++) {
        $.get(`/cache/check/${data[i][0]}`, () => {
          $('#images').append(createTag(data[i][0], data[i][1]));
        }).fail(() => {
          $('#images').append(`<div>cannot get ${data[i][1].fullPath}</div>`)
        });
        //console.log('<div class="center-block"><img src="/cache/' + data[i][0] + '"></img></div>')
      }
    });
  }
  function getSummary() {
    $.getJSON('/cache/summary', (data) => {
      if (data.totalImages !== 0) {
        if (totalImages === -1) {
          totalImages = data.totalImages;
        }
        getImage();
      } else {
        setTimeout(getSummary, 1000);
      }
      /*
      if (data.totalImages === 0 || data.totalImages > !== data.preparedImages) {
        setTimeout(getSummary, 1000);
      }
      */
    });
  }
})();
