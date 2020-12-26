import * as core from '@actions/core'
import { exec } from '@actions/exec'
import * as github from '@actions/github'
import { request } from 'graphql-request'
import { promises as fs } from 'fs'
import * as path from 'path'
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

const debug = (message: string) => core.debug(`[code] ${message}`)

async function run() {
  try {
    const hashnodeAuth = core.getInput('hashnodeAuth', { required: true })
    const hashnodeUsername = core.getInput('hashnodeUsername', { required: true })
    const postsPath = core.getInput('postsPath') || 'posts'
    const { owner, repo } = github.context.repo
    const repoUrl = `https://github.com/${owner}/${repo}.git`
    const postsLocation = path.join(`~`, repo, postsPath)

    debug(`Clone repo: ${repoUrl}`)

    exec(`git clone ${repoUrl} ~/${repo}`)

    debug(`Read posts location directory: ${postsLocation}`)
    debug(`Test: ${JSON.stringify(await fs.readdir(path.join(`~`, repo)))}`)

    const files = await fs.readdir(postsLocation)
    const filesMd = files.filter(fileName => fileName.endsWith('.md'))

    debug(`Fetch posts`)

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

    debug(`Posts: ${JSON.stringify(posts)}`)
    debug(`Files: ${JSON.stringify(filesMd)}`)

    const postsByName = posts.reduce((acc, post) => {
      acc[post.slug] = post
      return acc
    }, PostsByName.check({}))

    for (const fileName of filesMd) {
      const postName = fileName.replace('.md', '')
      if (postName in postsByName) {
        const fileData = (await fs.readFile(path.join(postsLocation, fileName))).toString()
        if (postsByName[postName].contentMarkdown !== fileData) {
          debug(`UPDATE: ${postName}`)
        }
        debug(`EXIST: ${postName}`)
      } else {
        debug(`CREATE: ${postName}`)
      }
    }

  } catch (error) {
    core.setFailed(error);
  }
}

run();
