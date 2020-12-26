import core from '@actions/core'
import { exec } from '@actions/exec'
import github from '@actions/github'
import { request } from 'graphql-request'
import { promises as fs } from 'fs'
import path from 'path'
import * as t from 'runtypes'

const Post = t.Record({
  "cuid": t.String,
  "slug": t.String,
  "contentMarkdown": t.String,
})
const PostsResp = t.Record({
  data: t.Record({
    user: t.Record({
      publication: t.Record({
        posts: t.Array(Post)
      })
    })
  })
})
const PostsByName = t.Dictionary(Post)

async function run() {
  try {
    const hashnodeAuth = core.getInput('hashnodeAuth', { required: true })
    const hashnodeUsername = core.getInput('hashnodeUsername', { required: true })
    const postsPath = core.getInput('postsPath') || 'posts'
    const { owner, repo } = github.context.repo

    exec(`git clone https://github.com/${owner}/${repo}.git ~/${repo}`)
    const postsLocation = path.join(`~`, repo, postsPath)
    const files = await fs.readdir(postsLocation)
    const filesMd = files.filter(fileName => fileName.endsWith('.md'))

    const posts = []
    for (let isAllPagesFetched = false, i = 0; !isAllPagesFetched; i++) {
      const resp = PostsResp.check(await request(
        'https://api.hashnode.com',
        `
          query($username:String!, $page: Int!) {
            user(username:$username) {
              publication {
                posts(page:$page) {
                  cuid
                  slug
                  contentMarkdown
                }
              }
            }
          }
        `,
        { username: hashnodeUsername, page: i }
      ))
      posts.push(...resp.data.user.publication.posts)
      isAllPagesFetched = resp.data.user.publication.posts.length === 0
    }

    core.debug(`POSTS: ${JSON.stringify(posts)}`)
    core.debug(`FILES: ${JSON.stringify(filesMd)}`)

    const postsByName = posts.reduce((acc, post) => {
      acc[post.slug] = post
      return acc
    }, PostsByName.check({}))

    for (const fileName of filesMd) {
      const postName = fileName.replace('.md', '')
      if (postName in postsByName) {
        const fileData = (await fs.readFile(path.join(postsLocation, fileName))).toString()
        if (postsByName[postName].contentMarkdown !== fileData) {
          core.debug(`UPDATE: ${postName}`)
        }
        core.debug(`EXIST: ${postName}`)
      } else {
        core.debug(`CREATE: ${postName}`)
      }
    }

  } catch (error) {
    console.error(error)
    core.setFailed(error);
  }
}

run();
